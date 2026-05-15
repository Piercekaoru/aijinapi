import type { Metadata } from "next";
import { PlaygroundClient } from "./playground-client";

export const metadata: Metadata = {
  title: "OpenAchieve 调试台",
};

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}
