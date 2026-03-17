import { Button } from "@/components/ui/button"
import { RotateCcw } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { SPECIALIST_AGENTS, AGENTS } from "./agentConfig"
import type { AgentId } from "./agentConfig"

type StatusType = "idle" | "thinking" | "responding"

interface DashboardHeaderProps {
  onReset: () => void
  canReset: boolean
  agentStatuses: Record<AgentId, StatusType>
}

function StatusDot({ status }: { status: StatusType }) {
  if (status === "thinking") {
    return <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
    </span>
  }
  if (status === "responding") {
    return <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
    </span>
  }
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-gray-300" />
}

export function DashboardHeader({ onReset, canReset, agentStatuses }: DashboardHeaderProps) {
  const { isAuthenticated, signOut } = useAuth()

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-black">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Startup Command Center</h1>
          <p className="text-xs text-gray-400">Powered by AWS Bedrock AgentCore.</p>
        </div>
        <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-zinc-700">
          {SPECIALIST_AGENTS.map(id => (
            <div key={id} className="flex items-center gap-1.5">
              <StatusDot status={agentStatuses[id]} />
              <span className="text-xs text-gray-300">{AGENTS[id].name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onReset} variant="outline" size="sm" className="gap-1.5 border-zinc-600 text-gray-300 hover:bg-zinc-800 hover:text-white bg-transparent" disabled={!canReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        {isAuthenticated && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-zinc-600 text-gray-300 hover:bg-zinc-800 hover:text-white bg-transparent">Logout</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to log out?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => signOut()}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  )
}
