import LandingContent from "@/components/LandingContent";
import StudioLoader from "@/components/StudioLoader";

// Server component: the studio itself is client-only (see StudioLoader), but
// the page shell and LandingContent render on the server so crawlers get real
// HTML without executing JS.
export default function Home() {
  return (
    <>
      <StudioLoader />
      <LandingContent />
    </>
  );
}
