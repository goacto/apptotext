import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conversion } = await supabase
    .from("conversions")
    .select("title, description, source_type, ai_provider, is_public")
    .eq("id", id)
    .single();

  if (!conversion) {
    return { title: "Conversion Not Found" };
  }

  const title = conversion.title;
  const description =
    conversion.description ||
    `${conversion.source_type === "github" ? "GitHub repo" : "Website"} converted to a learning textbook with ${conversion.ai_provider.toUpperCase()}`;

  return {
    title,
    description,
    openGraph: conversion.is_public
      ? {
          title: `${title} — AppToText`,
          description,
          type: "article",
        }
      : undefined,
  };
}

export default function ConversionLayout({ children }: Props) {
  return children;
}
