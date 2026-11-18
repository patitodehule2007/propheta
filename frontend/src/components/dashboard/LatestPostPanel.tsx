import type { CSSProperties, JSX } from "react";

import { formatEnumValue } from "../../shared/decisionFormat";
import { PipelineStepStatus } from "../../types/dashboard";
import type { LatestPost, PipelineStep } from "../../types/dashboard";
import { DecisionChip } from "../ui";
import { NOT_AVAILABLE_NOTE } from "./dashboard.constants";

const STEP_GLYPH: Record<PipelineStepStatus, string> = {
    passed: "✓",
    stopped: "■",
    "not-reached": "·"
};

const STEP_LABEL: Record<PipelineStepStatus, string> = {
    passed: "passed",
    stopped: "stopped",
    "not-reached": "not reached"
};

const postedAtFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function StepOutcome({ step }: { step: PipelineStep }): JSX.Element {
    if (step.decision !== null) return <DecisionChip decision={step.decision} />;
    return <span className="pipeline-state mono">{STEP_LABEL[step.status]}</span>;
}

function PipelineStepRow({ step, index }: { step: PipelineStep; index: number }): JSX.Element {
    const style = { "--enter-index": index } as CSSProperties;
    return (
        <li className="pipeline-step ui-enter" data-status={step.status} style={style}>
            <span className="pipeline-mark mono" aria-label={STEP_LABEL[step.status]}>
                {STEP_GLYPH[step.status]}
            </span>
            <span className="pipeline-stage mono">{formatEnumValue(step.stage)}</span>
            <span className="pipeline-outcome">
                <StepOutcome step={step} />
            </span>
            <span className="pipeline-detail" title={step.detail ?? undefined}>
                {step.detail}
            </span>
        </li>
    );
}

/**
 * The most recent monitored post and how far it travelled through the pipeline.
 *
 * @param props - The latest post, or null when no backend source exists.
 * @returns The rendered panel.
 */
export function LatestPostPanel({ post }: { post: LatestPost | null }): JSX.Element {
    return (
        <section className="panel" aria-labelledby="latest-post-title">
            <div className="panel-head">
                <h2 id="latest-post-title" className="panel-title">
                    Latest post
                </h2>
                {post !== null && (
                    <time className="panel-count mono" dateTime={post.postedAt}>
                        {postedAtFormatter.format(new Date(post.postedAt))}
                    </time>
                )}
            </div>
            {post === null ? (
                <p className="empty-state">{NOT_AVAILABLE_NOTE}.</p>
            ) : (
                <div className="panel-body post">
                    <p className="post-author mono">@{post.authorHandle}</p>
                    <blockquote className="post-text">{post.text}</blockquote>
                    <ol className="pipeline" aria-label="Pipeline stages">
                        {post.steps.map((step, index) => (
                            <PipelineStepRow key={step.stage} step={step} index={index} />
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}
