import {
  Rocket,
  Zap,
  BookOpen,
  Search,
  GitBranch,
  Bookmark,
  RefreshCw,
  Mail,
  MessageCircle,
  Users,
  Route,
  Smartphone,
  Code,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RoadmapItem {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface RoadmapSection {
  title: string;
  dotColor: string;
  badgeVariant: "default" | "secondary" | "outline";
  items: RoadmapItem[];
}

const sections: RoadmapSection[] = [
  {
    title: "Up Next",
    dotColor: "bg-green-500",
    badgeVariant: "default",
    items: [
      {
        icon: <Zap className="size-5 text-green-500" />,
        title: "Streaming AI Responses",
        description: "Watch content generate in real-time",
      },
      {
        icon: <BookOpen className="size-5 text-green-500" />,
        title: "Multi-Chapter Generation",
        description: "3-5 chapters per level for deeper learning",
      },
      {
        icon: <Search className="size-5 text-green-500" />,
        title: "Search & Filter",
        description: "Find conversions by title, provider, or date",
      },
    ],
  },
  {
    title: "On the Radar",
    dotColor: "bg-yellow-500",
    badgeVariant: "secondary",
    items: [
      {
        icon: <GitBranch className="size-5 text-yellow-500" />,
        title: "GitHub OAuth Sign-In",
        description: "Login with your GitHub account",
      },
      {
        icon: <Bookmark className="size-5 text-yellow-500" />,
        title: "Bookmark Chapters",
        description: "Save favorites for quick reference",
      },
      {
        icon: <RefreshCw className="size-5 text-yellow-500" />,
        title: "Quiz Retry",
        description: "Re-take only questions you got wrong",
      },
      {
        icon: <Mail className="size-5 text-yellow-500" />,
        title: "Email Notifications",
        description: "Streak reminders and weekly progress",
      },
    ],
  },
  {
    title: "Future Vision",
    dotColor: "bg-blue-500",
    badgeVariant: "outline",
    items: [
      {
        icon: <MessageCircle className="size-5 text-blue-500" />,
        title: "AI Tutor Chat",
        description: "Ask follow-up questions about content",
      },
      {
        icon: <Users className="size-5 text-blue-500" />,
        title: "Team Workspaces",
        description: "Collaborative learning for organizations",
      },
      {
        icon: <Route className="size-5 text-blue-500" />,
        title: "Learning Paths",
        description: "Curated sequences for tech stacks",
      },
      {
        icon: <Smartphone className="size-5 text-blue-500" />,
        title: "Mobile App",
        description: "Native flashcard study on-the-go",
      },
      {
        icon: <Code className="size-5 text-blue-500" />,
        title: "Code Playground",
        description: "Interactive code sandbox in chapters",
      },
    ],
  },
];

export default function ComingSoonPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Rocket className="size-5 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Coming Soon
          </h1>
        </div>
        <p className="mt-3 text-lg text-muted-foreground">
          What we&apos;re building next for the GOACTO community
        </p>
      </div>

      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span
                  className={`inline-block size-2.5 rounded-full ${section.dotColor}`}
                />
                {section.title}
                <Badge variant={section.badgeVariant} className="ml-auto text-xs">
                  {section.items.length} items
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{item.icon}</div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Have a suggestion?{" "}
          <a
            href="https://github.com/goacto/apptotext/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Open a GitHub issue
            <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
    </div>
  );
}
