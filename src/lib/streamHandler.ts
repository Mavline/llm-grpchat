interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

// Track active abort controllers for cancellation
const activeControllers = new Map<string, AbortController>();

export function stopAllStreams(): void {
  activeControllers.forEach((controller) => {
    try {
      controller.abort();
    } catch {
      // ignore abort errors
    }
  });
  activeControllers.clear();
}

export function stopStream(modelId: string): void {
  const controller = activeControllers.get(modelId);
  if (controller) {
    try {
      controller.abort();
    } catch {
      // ignore abort errors
    }
    activeControllers.delete(modelId);
  }
}

export function hasActiveStreams(): boolean {
  return activeControllers.size > 0;
}

export async function streamModelResponse(
  modelId: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks
): Promise<void> {
  const { onToken, onComplete, onError } = callbacks;

  // Create abort controller for this request
  const controller = new AbortController();
  activeControllers.set(modelId, controller);

  // Timeout protection - abort if no response in 10 seconds
  const timeout = setTimeout(() => {
    if (activeControllers.has(modelId)) {
      controller.abort("Request timeout");
    }
  }, 10000);

  let hasContent = false;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, messages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // ignore parse error
      }
      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Check if aborted
      if (controller.signal.aborted) {
        reader.cancel();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            clearTimeout(timeout);
            activeControllers.delete(modelId);
            // If no content was received, send placeholder
            if (!hasContent) {
              onToken("[Модель не ответила]");
            }
            onComplete();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              hasContent = true;
              onToken(parsed.content);
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    clearTimeout(timeout);
    activeControllers.delete(modelId);
    // If no content was received, send placeholder
    if (!hasContent) {
      onToken("[Модель не ответила]");
    }
    onComplete();
  } catch (error) {
    clearTimeout(timeout);
    activeControllers.delete(modelId);
    const err = error as Error;
    // Check for abort - can be AbortError or error with abort message
    if (err.name === "AbortError" ||
        String(err).toLowerCase().includes("abort") ||
        String(err).includes("stopped") ||
        String(err).includes("timeout")) {
      // If timed out with no content, show error
      if (!hasContent && String(err).includes("timeout")) {
        onToken("[Таймаут запроса]");
      }
      onComplete(); // Treat abort as completion (message stays as-is)
      return;
    }
    onError(err);
  }
}
