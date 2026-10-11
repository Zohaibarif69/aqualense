import { Suspense } from "react";
import Environment from "@/views/Environment";

export default function Page() {
  return (
    <Suspense>
      <Environment />
    </Suspense>
  );
}
