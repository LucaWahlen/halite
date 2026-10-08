import { Link } from "react-router";
import { Button } from "@heroui/react";

import { useCart } from "../lib/cart";

export function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H5.2" />
    </svg>
  );
}

export function CartButton() {
  const cart = useCart();
  const count = cart.length;
  return (
    <Link to="/einkaufsliste" aria-label={count > 0 ? `Einkaufsliste (${count})` : "Einkaufsliste"}>
      <Button variant="secondary" size="sm" isIconOnly className="relative">
        <CartIcon />
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </Button>
    </Link>
  );
}
