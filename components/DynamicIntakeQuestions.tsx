"use client";

import { useState } from "react";
import { IntakeQuestion } from "@/app/api/agents/resume/intake-questions/route";
import { IntakeData } from "@/components/IntakeForm";

interface DynamicIntakeQuestionsProps {
  message: string;
  questions: IntakeQuestion[];
  onSubmit: (data: IntakeData, answers: Record<string, string>) => void;
}

export default function DynamicIntakeQuestions({
  message,
  questions,
  onSubmit,
}: DynamicIntakeQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function handleSubmit() {
    // Map answers to IntakeData
    const reviewDepth = answers["review_depth"] ?? "Full Review";
    const targetMarket = (answers["target_market"] ?? "US General") as IntakeData["targetMarket"];
    const seniority = (answers["seniority_targeting"] ?? "Senior") as IntakeData["seniorityLevel"];
    const jd = answers["job_description"] ?? "";

    const reviewType: IntakeData["reviewType"] =
      reviewDepth.toLowerCase().includes("quick") ? "Quick Scan" : "Full Review";

    const seniorityLevel: IntakeData["seniorityLevel"] =
      seniority.toLowerCase().includes("manager") ? "Manager" :
      seniority.toLowerCase().includes("staff") || seniority.toLowerCase().includes("principal") ? "Staff / Principal" :
      seniority.toLowerCase().includes("mid") ? "Mid" : "Senior";

    onSubmit(
      { reviewType, targetMarket, seniorityLevel, jobDescription: jd === "no jd" || jd === "no JD" ? "" : jd },
      answers
    );
  }

  const allRequired = questions
    .filter((q) => q.chips !== null) // chip questions are required
    .every((q) => !!answers[q.id]);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[#2a2a2a] bg-[#111] overflow-hidden">
      {/* Message */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1e1e1e]">
        <p className="text-sm text-[#c8c8c8] leading-relaxed">{message}</p>
      </div>

      {/* Questions */}
      <div className="px-4 py-3 space-y-5">
        {questions.map((q) => (
          <div key={q.id}>
            <p className="text-xs text-[#888] mb-2 leading-relaxed">{q.text}</p>

            {q.chips ? (
              /* Chip question */
              <div className="flex flex-wrap gap-1.5">
                {q.chips.map((chip) => {
                  const selected = answers[q.id] === chip;
                  return (
                    <button
                      key={chip}
                      onClick={() => setAnswer(q.id, chip)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        selected
                          ? "bg-white text-black border-white font-medium"
                          : "border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#3a3a3a]"
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Free text question */
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Paste JD here, or type 'no JD'..."
                rows={3}
                className="w-full resize-none text-xs text-gray-300 placeholder-[#444] bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2.5 outline-none focus:border-[#3a3a3a] transition-colors leading-relaxed"
              />
            )}
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={handleSubmit}
          disabled={!allRequired}
          style={{ background: allRequired ? "linear-gradient(90deg, #fff7ad, #ffa9f9)" : undefined }}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
            allRequired
              ? "text-black active:scale-95 hover:opacity-90"
              : "bg-[#1e1e1e] text-[#444] border border-[#2a2a2a] cursor-not-allowed"
          }`}
        >
          Start review
        </button>
      </div>
    </div>
  );
}
