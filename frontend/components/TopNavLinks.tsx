"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Jobs" },
  { href: "/trends", label: "Radar" },
  { href: "/saved", label: "Saved" },
  { href: "/about", label: "About" },
];

/**
 * Desktop top-nav links with an active state for the current page (#140).
 * Client component (needs usePathname) so the rest of the root layout can
 * stay a Server Component — same isolation pattern as BottomTabBar, which
 * already has its own active-state logic for the mobile equivalent.
 */
export default function TopNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="hidden lg:inline text-sm transition-colors"
            style={{
              color: active ? "var(--accent)" : "var(--ink-soft)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
