import { useNavigate } from 'react-router-dom';
import { ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AmazonBreadcrumbsProps {
  currentMode?: string;
  items?: { label: string; to?: string }[];
  className?: string;
}

export function AmazonBreadcrumbs({ currentMode, items, className }: AmazonBreadcrumbsProps) {
  const navigate = useNavigate();

  return (
    <nav className={cn("flex items-center gap-2 text-sm text-muted-foreground mb-6", className)}>
      <button 
        onClick={() => navigate('/amazon')}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors group"
      >
        <Package className="h-4 w-4 text-primary/70 group-hover:text-primary transition-colors" />
        <span className="font-medium">选品助手</span>
      </button>

      {currentMode && (
        <>
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          <span className="text-foreground font-semibold">{currentMode}</span>
        </>
      )}

      {items?.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          {item.to ? (
            <button 
              onClick={() => navigate(item.to!)}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className={cn(index === items.length - 1 ? "text-foreground font-semibold" : "")}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
