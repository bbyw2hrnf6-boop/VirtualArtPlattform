import { useEffect, useState } from "react";
import { loadCreatorAttribution, type CreatorAttribution } from "../../services/creatorProfile";

export function CreatorAttributionLink({
  spaceId,
  fallback,
  className,
}: {
  spaceId: string;
  fallback: string;
  className?: string;
}) {
  const [creator, setCreator] = useState<CreatorAttribution | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadCreatorAttribution(spaceId, controller.signal)
      .then(setCreator)
      .catch(() => setCreator(null));
    return () => controller.abort();
  }, [spaceId]);
  return creator
    ? <a className={className} href={creator.profileUrl}>By {creator.displayName}</a>
    : <span className={className}>{fallback}</span>;
}
