import { useEffect, useState } from "react";
import { useCompany, getSignedLogoUrl } from "@/hooks/use-company";
import { cn } from "@/lib/utils";
import g3Logo from "@/assets/g3-expresso-logo.png.asset.json";


type Props = {
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function Logo({ variant = "full", className, size = "md" }: Props) {
  const { data: company } = useCompany();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSignedLogoUrl(company?.logo_url ?? null).then((url) => {
      if (alive) setLogoUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [company?.logo_url]);

  const heights = { sm: "h-7", md: "h-9", lg: "h-14" };

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={company?.nome_fantasia ?? "G3 Expresso"}
        className={cn(heights[size], "w-auto object-contain", className)}
      />
    );
  }

  // Fallback wordmark tipográfico
  const textSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  if (variant === "mark") {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-md bg-brand text-brand-foreground font-display font-bold",
          size === "lg" ? "size-12 text-xl" : size === "sm" ? "size-7 text-xs" : "size-9 text-sm",
          className,
        )}
      >
        G3
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2 font-display font-bold tracking-tight", textSize, className)}>
      <span
        className={cn(
          "grid place-items-center rounded-md bg-brand text-brand-foreground",
          size === "lg" ? "size-10 text-lg" : size === "sm" ? "size-6 text-xs" : "size-8 text-sm",
        )}
      >
        G3
      </span>
      <span className="uppercase tracking-[0.14em]">
        <span className="text-foreground">Expresso</span>
      </span>
    </div>
  );
}
