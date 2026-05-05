import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface Product {
  name: string;
  brand?: string;
  price: string;
  rating: number;
  summary: string;
  pros?: string[];
  cons?: string[];
  category?: string;
  image_url?: string;
  purchase_url?: string;
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  return (
    <Card
      className="group relative overflow-hidden border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elegant animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-primary opacity-0 transition-opacity group-hover:opacity-100" />
      {product.image_url && (
        <div className="mb-4 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
          <img
            src={product.image_url}
            alt={product.name}
            className="h-40 w-full object-cover transition-transform group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {product.brand && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {product.brand}
            </p>
          )}
          <h3 className="font-display text-base font-semibold leading-tight">{product.name}</h3>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-bold text-gradient-primary">{product.price}</p>
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-warning text-warning" />
            <span>{product.rating.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{product.summary}</p>

      {(product.pros?.length || product.cons?.length) ? (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {product.pros?.length ? (
            <div>
              <p className="font-semibold text-success mb-1">Pros</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {product.pros.slice(0, 3).map((p, i) => (
                  <li key={i} className="line-clamp-1">+ {p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {product.cons?.length ? (
            <div>
              <p className="font-semibold text-destructive mb-1">Cons</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {product.cons.slice(0, 3).map((p, i) => (
                  <li key={i} className="line-clamp-1">− {p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {product.category && (
        <Badge variant="secondary" className="mt-4 text-xs">
          {product.category}
        </Badge>
      )}
      {product.purchase_url && (
        <div className="mt-4">
          <Button asChild size="sm" className="w-full">
            <a href={product.purchase_url} target="_blank" rel="noreferrer">
              Buy Now
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
}
