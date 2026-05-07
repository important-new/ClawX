import { useNavigate } from 'react-router-dom';
import { ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  to?: string;
  onClick?: () => void;
}

interface AmazonBreadcrumbsProps {
  currentMode?: string;
  /** Optional click handler for the currentMode label (e.g. reset wizard step). */
  currentModeOnClick?: () => void;
  items?: BreadcrumbItem[];
  className?: string;
}

export function AmazonBreadcrumbs({
  currentMode,
  currentModeOnClick,
  items,
  className,
}: AmazonBreadcrumbsProps) {
  const navigate = useNavigate();
  // The currentMode is the active label only when it's the deepest crumb
  // (i.e. no further items). When items follow it, it should look like a
  // nav target — bold + clickable if a handler is provided.
  const isDeepest = !items || items.length === 0;

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
          {currentModeOnClick && !isDeepest ? (
            <button
              onClick={currentModeOnClick}
              className="hover:text-foreground transition-colors"
            >
              {currentMode}
            </button>
          ) : (
            <span className={cn(isDeepest && "text-foreground font-semibold")}>{currentMode}</span>
          )}
        </>
      )}

      {items?.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          {item.to || item.onClick ? (
            <button
              onClick={() => (item.onClick ? item.onClick() : navigate(item.to!))}
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
