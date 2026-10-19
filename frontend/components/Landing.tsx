/** Blocks shared by the Russian landing and the English one at /en. */
import type { ComponentType } from "react";

export interface LandingNumber {
  label: string;
  value: number | undefined;
}

export interface LandingFeature {
  icon: ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  title: string;
  text: string;
}

export interface LandingStep {
  title: string;
  text: string;
}

/** Big site-wide numbers in a strip: two columns on phones, four wider. */
export function NumbersStrip({
  label,
  numbers,
  format,
}: Readonly<{
  label: string;
  numbers: LandingNumber[];
  format: (n: number) => string;
}>) {
  return (
    <section aria-label={label} className="border-y border-line-soft">
      <dl className="mx-auto grid w-full max-w-[1200px] grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
        {numbers.map((n, i) => (
          <div
            key={n.label}
            className={`flex flex-col-reverse gap-1.5 py-6 md:py-8 ${
              i % 2 === 1 ? "border-l border-line-soft pl-5 md:pl-8" : ""
            } ${i === 2 ? "md:border-l md:border-line-soft md:pl-8" : ""} ${
              i >= 2 ? "border-t border-line-soft md:border-t-0" : ""
            }`}
          >
            <dt className="text-[13px] text-fg-2">{n.label}</dt>
            <dd className="font-mono text-2xl font-medium tracking-[-0.02em] md:text-[32px]">
              {n.value === undefined ? "—" : format(n.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function FeatureGrid({
  features,
  columns = 3,
}: Readonly<{ features: LandingFeature[]; columns?: 2 | 3 }>) {
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line ${
        columns === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
      }`}
    >
      {features.map((f) => (
        <article key={f.title} className="flex flex-col gap-3.5 bg-bg p-7">
          <f.icon
            className="h-[22px] w-[22px] text-accent"
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold">{f.title}</h3>
          <p className="text-sm leading-relaxed text-fg-2">{f.text}</p>
        </article>
      ))}
    </div>
  );
}

/** "How it works": numbered steps under a heading (anchor #how). */
export function StepsSection({
  title,
  steps,
}: Readonly<{ title: string; steps: LandingStep[] }>) {
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="mx-auto flex w-full max-w-[1200px] scroll-mt-8 flex-col gap-10 px-4 pt-20 sm:px-6 lg:pt-24"
    >
      <h2
        id="how-title"
        className="text-[30px] font-semibold tracking-[-0.025em] md:text-4xl"
      >
        {title}
      </h2>
      <StepList steps={steps} />
    </section>
  );
}

function StepList({ steps }: Readonly<{ steps: LandingStep[] }>) {
  return (
    <ol className="grid gap-10 md:grid-cols-3">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className={`flex flex-col gap-3.5 border-t pt-5 ${i === 0 ? "border-accent" : "border-line"}`}
        >
          <span
            className={`font-mono text-[13px] ${i === 0 ? "text-accent" : "text-fg-3"}`}
          >
            0{i + 1}
          </span>
          <h3 className="text-lg font-semibold">{s.title}</h3>
          <p className="text-sm leading-relaxed text-fg-2">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
