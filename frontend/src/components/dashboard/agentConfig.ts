export type AgentId = "business-advisor" | "marketing-director" | "cfo" | "cto"

export interface AgentConfig {
  id: AgentId
  name: string
  title: string
  description: string
  color: string       // tailwind border/accent color
  bgColor: string     // tailwind background color for header
  textColor: string   // tailwind text color
  iconLabel: string   // emoji or short label for avatar
}

export const AGENTS: Record<AgentId, AgentConfig> = {
  "business-advisor": {
    id: "business-advisor",
    name: "Business Advisor",
    title: "Lead Strategist & Supervisor",
    description: "Analyzes your idea holistically and coordinates the specialist team",
    color: "border-indigo-500",
    bgColor: "bg-indigo-50",
    textColor: "text-indigo-700",
    iconLabel: "BA",
  },
  "marketing-director": {
    id: "marketing-director",
    name: "Marketing Director",
    title: "Go-to-Market & Growth",
    description: "Market strategy, customer acquisition, branding, and competitive positioning",
    color: "border-emerald-500",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    iconLabel: "MD",
  },
  "cfo": {
    id: "cfo",
    name: "CFO",
    title: "Finance & Fundraising",
    description: "Financial modeling, unit economics, pricing, and fundraising strategy",
    color: "border-amber-500",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    iconLabel: "CF",
  },
  "cto": {
    id: "cto",
    name: "CTO",
    title: "AWS Solutions Architect",
    description: "AWS stack, serverless architecture, MVP scope, and cloud infrastructure",
    color: "border-sky-500",
    bgColor: "bg-sky-50",
    textColor: "text-sky-700",
    iconLabel: "CT",
  },
}

export const SPECIALIST_AGENTS: AgentId[] = ["marketing-director", "cfo", "cto"]
