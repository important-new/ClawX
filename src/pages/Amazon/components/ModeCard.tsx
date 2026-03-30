import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface ModeCardProps {
  icon: ReactNode
  title: string
  description: string
  tags?: string[]
  onClick: () => void
  accent?: string
}

export function ModeCard({ icon, title, description, tags, onClick, accent = 'bg-primary/10 text-primary' }: ModeCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left w-full rounded-xl border bg-card p-5 transition-all duration-200',
        'hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className={cn('inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3', accent)}>
        {icon}
      </div>
      <h3 className="font-semibold text-[15px] text-foreground mb-1">{title}</h3>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">{description}</p>
      {tags && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
