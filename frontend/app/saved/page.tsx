import type { Metadata } from "next";
import { SHARED_OG } from "@/lib/siteMetadata";
import SavedWrapper from "./SavedWrapper";

export const metadata: Metadata = {
  title: "Saved Jobs",
  description:
    "Track saved roles, application status, and local job alerts.",
  openGraph: {
    ...SHARED_OG,
    title: "Saved Jobs",
    description:
      "Track saved roles, application status, and local job alerts.",
    url: "/saved",
  },
  alternates: {
    canonical: "/saved",
  },
};

export default function SavedPage() {
  return <SavedWrapper />;
}
