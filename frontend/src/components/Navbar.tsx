"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { Brain } from "lucide-react";

const navLinks = [
  { href: "/", label: "Reviews" },
  { href: "/agents", label: "Agents" },
  { href: "/delegate", label: "Delegate" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-pink-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="flex size-8 items-center justify-center rounded-lg bg-pink-500">
            <Brain className="size-4.5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">
            Claw<span className="text-pink-500">dera</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-pink-50 text-pink-600"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <ConnectButton />
      </div>

      {/* Mobile nav */}
      <div className="flex border-t border-pink-50 sm:hidden">
        {navLinks.map(({ href, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-pink-500 text-pink-600"
                  : "text-gray-500"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
