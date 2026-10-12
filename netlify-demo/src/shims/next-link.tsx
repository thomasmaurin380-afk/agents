import type * as React from "react";

/** Substitut statique de next/link : simple ancre (la démonstration n'a qu'une page). */
export default function Link({ href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return <a href={href} {...props} />;
}
