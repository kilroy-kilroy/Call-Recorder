"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    router.replace(`/dashboard?${params.toString()}`);
  }

  return (
    <Input
      type="search"
      placeholder="Search transcripts..."
      defaultValue={query}
      onChange={(e) => handleSearch(e.target.value)}
      className="max-w-md"
    />
  );
}
