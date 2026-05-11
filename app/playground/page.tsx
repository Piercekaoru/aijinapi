import type { Metadata } from "next";
import { PlaygroundClient } from "./playground-client";

export const metadata: Metadata = {
  title: "AIJinAPI 调试台",
};

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}
