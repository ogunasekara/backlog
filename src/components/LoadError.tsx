import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** A load that failed with nothing cached to show instead. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden />
        Try again
      </Button>
    </div>
  )
}
