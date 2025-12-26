"use client";

import { useEffect } from "react";
import { ChatContainer } from "@/components/ChatContainer";

export default function Home() {
  useEffect(() => {
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      if (
        event.reason?.name === "AbortError" ||
        event.reason?.message?.includes("aborted")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    
    const errorHandler = (event: ErrorEvent) => {
      if (
        event.message?.includes("AbortError") ||
        event.message?.includes("aborted")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    
    window.addEventListener("unhandledrejection", rejectionHandler);
    window.addEventListener("error", errorHandler);
    
    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      window.removeEventListener("error", errorHandler);
    };
  }, []);

  return <ChatContainer />;
}
