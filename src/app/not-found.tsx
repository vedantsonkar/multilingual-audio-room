import Link from "next/link";
export default function NotFound() { return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6"><h1 className="text-2xl font-medium">This page wandered off.</h1><Link href="/" className="text-primary underline underline-offset-4">Go back to Common</Link></main>; }
