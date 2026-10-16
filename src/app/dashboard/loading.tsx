import { PageSkeleton } from "@/components/PageSkeleton";

/** Shown inside the sidebar layout the moment someone navigates, while the page's data loads. */
export default function Loading() {
  return <PageSkeleton />;
}
