/**
 * Permission request item - displays in chat feed when agent needs authorization
 */
import { usePermissionStore } from '../stores/permissionStore'
import { Button } from '@/components/ui/button'
import type { PermissionRequest } from '../../../shared/electron-api'

interface PermissionRequestItemProps {
  request: PermissionRequest
}

export function PermissionRequestItem({ request }: PermissionRequestItemProps) {
  const pendingRequest = usePermissionStore((s) => s.pendingRequest)
  const respondToRequest = usePermissionStore((s) => s.respondToRequest)

  const { toolCall, options } = request
  const isPending = pendingRequest?.requestId === request.requestId

  // Format raw input for display
  const formatInput = (input: unknown): string => {
    if (!input) return ''
    if (typeof input === 'string') return input
    try {
      return JSON.stringify(input, null, 2)
    } catch {
      return String(input)
    }
  }

  const inputDisplay = formatInput(toolCall.rawInput)

  // Find allow/deny options
  const allowOption = options.find((o) => o.kind === 'allow') || options[0]
  const denyOption = options.find((o) => o.kind === 'deny') || options[options.length - 1]

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-amber-500 text-sm">●</span>
        <span className="font-medium text-sm text-foreground">Permission Required</span>
      </div>

      {/* Tool call info */}
      <div className="rounded-md bg-muted/50 p-2.5">
        <div className="font-medium text-sm text-foreground">{toolCall.title || 'Tool Call'}</div>
        {toolCall.kind && (
          <div className="text-xs text-muted-foreground mt-0.5">Type: {toolCall.kind}</div>
        )}
      </div>

      {/* Input details */}
      {inputDisplay && (
        <div className="rounded-md bg-muted/50 p-2.5">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {inputDisplay}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      {isPending ? (
        <div className="flex gap-2">
          {options.length > 2 ? (
            // Multiple options - show all
            options.map((option) => (
              <Button
                key={option.optionId}
                size="sm"
                variant={option.kind === 'allow' ? 'default' : option.kind === 'deny' ? 'destructive' : 'outline'}
                onClick={() => respondToRequest(option.optionId)}
              >
                {option.name}
              </Button>
            ))
          ) : (
            // Simple allow/deny
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respondToRequest(denyOption.optionId)}
              >
                {denyOption.name || 'Deny'}
              </Button>
              <Button
                size="sm"
                onClick={() => respondToRequest(allowOption.optionId)}
              >
                {allowOption.name || 'Allow'}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          Responded
        </div>
      )}
    </div>
  )
}
