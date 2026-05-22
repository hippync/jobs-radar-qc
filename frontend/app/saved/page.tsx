import type { Metadata } from "next";
import SavedWrapper from "./SavedWrapper";

export const metadata: Metadata = {
  title: "Saved Jobs | Jobs Radar /qc",
  description: "Track your job applications across stages — stored locally in your browser.",
};

export default function SavedPage() {
  return <SavedWrapper />;
}
