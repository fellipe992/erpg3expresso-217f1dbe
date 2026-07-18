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

  // Fallback: usa o logo oficial embutido
  return (
    <img
      src={g3Logo.url}
      alt={company?.nome_fantasia ?? "G3 Expresso"}
      className={cn(heights[size], "w-auto object-contain", className)}
    />
  );

}
