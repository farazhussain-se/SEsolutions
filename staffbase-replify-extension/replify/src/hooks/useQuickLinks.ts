import { useState } from "react";
import { DEFAULT_QUICK_LINKS } from "../constants/appConstants";

interface QuickLink {
  name: string;
  title: string;
  position: number;
  enabled: boolean;
}

type QuickLinkField = keyof QuickLink;

export default function useQuickLinks(initialLinks: QuickLink[] = DEFAULT_QUICK_LINKS) {
  const [mobileQuickLinks, setMobileQuickLinks] = useState<QuickLink[]>(initialLinks);
  const [quickLinksEnabled, setQuickLinksEnabled] = useState(false);

  const handleQuickLinkChange = (
    idx: number,
    field: QuickLinkField,
    val: string | number | boolean
  ) => {
    setMobileQuickLinks((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val } as QuickLink;
      copy.forEach((link, i) => {
        link.position = i;
      });
      return copy;
    });
  };

  const handleQuickLinkSwap = (aIdx: number, bIdx: number) => {
    setMobileQuickLinks((prev) => {
      const copy = [...prev];
      [copy[aIdx].position, copy[bIdx].position] = [
        copy[bIdx].position,
        copy[aIdx].position,
      ];
      return copy;
    });
  };

  const handleQuickLinkDelete = (idx: number) =>
    setMobileQuickLinks((prev) =>
      prev.filter((_, i) => i !== idx).map((link, i) => ({ ...link, position: i }))
    );

  const handleQuickLinkAdd = () =>
    setMobileQuickLinks((prev) => [
      ...prev,
      { name: "", title: "", position: prev.length, enabled: true },
    ]);

  return {
    mobileQuickLinks,
    quickLinksEnabled,
    setQuickLinksEnabled,
    handleQuickLinkChange,
    handleQuickLinkSwap,
    handleQuickLinkDelete,
    handleQuickLinkAdd,
  };
}