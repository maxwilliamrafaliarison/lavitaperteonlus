import { handlers } from "@/auth";

// bcrypt + googleapis nécessitent Node, pas Edge
export const runtime = "nodejs";

export const { GET, POST } = handlers;
