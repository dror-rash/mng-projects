import { LoginForm } from "@/features/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { getTranslations } from "next-intl/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations("login");

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">{t("heading")}</CardTitle>
          <CardDescription>
            Enter your credentials to access your projects and workspaces
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
        <CardFooter className="flex justify-center border-t p-4 text-sm text-muted-foreground">
          New here?{" "}
          <a
            className="ml-1 font-medium text-primary underline hover:text-primary/80"
            href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          >
            Create an account
          </a>
        </CardFooter>
      </Card>
    </main>
  );
}
