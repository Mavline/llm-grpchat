"use client";

import { useEffect } from "react";
import { ChatContainer } from "@/components/ChatContainer";

export default function Home() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === "AbortError") {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return <ChatContainer />;
}
