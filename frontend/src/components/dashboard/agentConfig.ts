export type AgentId =
  | "business-advisor"
  | "marketing-director"
  | "cfo"
  | "cto"
  | "ciso"
  | "senior-web-developer"
  | "ma-advisor"
  | "ip-attorney"
  | "hr-talent"
  | "healthcare-compliance"
  | "data-privacy"
  | "supply-chain"
  | "regulatory-affairs"
  | "international-expansion"
  | "esg-advisor"

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
    name: "Chief Financial Officer",
    title: "Finance & Fundraising",
    description: "Financial modeling, unit economics, pricing, and fundraising strategy",
    color: "border-amber-500",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    iconLabel: "CFO",
  },
  "cto": {
    id: "cto",
    name: "Chief Technology Officer",
    title: "AWS Solutions Architect",
    description: "AWS stack, serverless architecture, MVP scope, and cloud infrastructure",
    color: "border-sky-500",
    bgColor: "bg-sky-50",
    textColor: "text-sky-700",
    iconLabel: "CTO",
  },
  "ciso": {
    id: "ciso",
    name: "Chief Information Security Officer",
    title: "Security & Compliance",
    description: "AWS security best practices, compliance, IAM, threat modeling, and data protection",
    color: "border-rose-500",
    bgColor: "bg-rose-50",
    textColor: "text-rose-700",
    iconLabel: "CISO",
  },
  // SME bench — dynamically added when Business Advisor recommends
  "senior-web-developer": {
    id: "senior-web-developer",
    name: "Senior Web Developer",
    title: "Full-Stack Engineering Lead",
    description: "Frontend/backend architecture, tech stack selection, UX patterns, and development velocity",
    color: "border-violet-500",
    bgColor: "bg-violet-50",
    textColor: "text-violet-700",
    iconLabel: "SWD",
  },
  "ma-advisor": {
    id: "ma-advisor",
    name: "M&A Advisor",
    title: "Mergers, Acquisitions & Exit Strategy",
    description: "Fundraising strategy, valuation, acquisition readiness, investor relations, and exit planning",
    color: "border-purple-500",
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    iconLabel: "M&A",
  },
  "ip-attorney": {
    id: "ip-attorney",
    name: "IP & Patent Attorney",
    title: "Intellectual Property Counsel",
    description: "Patents, trade secrets, IP protection strategy, licensing, and freedom-to-operate analysis",
    color: "border-slate-500",
    bgColor: "bg-slate-50",
    textColor: "text-slate-700",
    iconLabel: "IP",
  },
  "hr-talent": {
    id: "hr-talent",
    name: "HR & Talent Architect",
    title: "People, Culture & Org Design",
    description: "Team building, equity structure, hiring plan, compensation strategy, and culture design",
    color: "border-teal-500",
    bgColor: "bg-teal-50",
    textColor: "text-teal-700",
    iconLabel: "HR",
  },
  "healthcare-compliance": {
    id: "healthcare-compliance",
    name: "Healthcare Compliance Officer",
    title: "HIPAA, FDA & Clinical Standards",
    description: "HIPAA compliance, FDA digital health guidance, clinical data handling, and hospital procurement",
    color: "border-cyan-500",
    bgColor: "bg-cyan-50",
    textColor: "text-cyan-700",
    iconLabel: "HCO",
  },
  "data-privacy": {
    id: "data-privacy",
    name: "Data Privacy Officer",
    title: "GDPR, CCPA & Privacy Compliance",
    description: "Consumer data rights, GDPR/CCPA compliance, PII handling, data retention policies",
    color: "border-orange-500",
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    iconLabel: "DPO",
  },
  "supply-chain": {
    id: "supply-chain",
    name: "Supply Chain & Ops Expert",
    title: "Operations & Logistics Strategy",
    description: "Physical product logistics, manufacturing, inventory management, supplier strategy, and ops scaling",
    color: "border-yellow-500",
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-700",
    iconLabel: "SCO",
  },
  "regulatory-affairs": {
    id: "regulatory-affairs",
    name: "Regulatory Affairs Specialist",
    title: "Industry Compliance & Licensing",
    description: "Fintech (SEC/FINRA), pharma, food/beverage, energy, and other heavily regulated industry compliance",
    color: "border-fuchsia-500",
    bgColor: "bg-fuchsia-50",
    textColor: "text-fuchsia-700",
    iconLabel: "REG",
  },
  "international-expansion": {
    id: "international-expansion",
    name: "International Expansion Advisor",
    title: "Global GTM & Market Entry",
    description: "Global go-to-market strategy, localization, international entity structure, tax, and cross-border compliance",
    color: "border-blue-500",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    iconLabel: "IEA",
  },
  "esg-advisor": {
    id: "esg-advisor",
    name: "ESG & Sustainability Advisor",
    title: "Impact, ESG & B-Corp Strategy",
    description: "ESG frameworks, impact investing, carbon footprint, B-corp certification, and sustainability positioning",
    color: "border-lime-500",
    bgColor: "bg-lime-50",
    textColor: "text-lime-700",
    iconLabel: "ESG",
  },
}

// Core board — always present from session start
export const SPECIALIST_AGENTS: AgentId[] = ["marketing-director", "cfo", "cto", "ciso"]

// SME bench — dynamically invited by the Business Advisor based on context
export const SME_AGENTS: AgentId[] = [
  "senior-web-developer",
  "ma-advisor",
  "ip-attorney",
  "hr-talent",
  "healthcare-compliance",
  "data-privacy",
  "supply-chain",
  "regulatory-affairs",
  "international-expansion",
  "esg-advisor",
]
