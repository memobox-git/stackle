"use client";

import { useState } from "react";

export interface IntakeData {
  reviewType: "ATS Scan" | "Full Review" | "Rewrite" | "Quick Scan";
  targetMarket: "US General" | "Big Tech / FAANG" | "Canada" | "India";
  seniorityLevel: "Mid" | "Senior" | "Staff / Principal" | "Manager";
  jobDescription: string;
}

interface IntakeFormProps {
  onSubmit: (data: IntakeData) => void;
}

const REVIEW_TYPES: IntakeData["reviewType"][] = ["ATS Scan", "Full Review", "Rewrite", "Quick Scan"];
const TARGET_MARKETS: IntakeData["targetMarket"][] = ["US General", "Big Tech / FAANG", "Canada", "India"];
const SENIORITY_LEVELS: IntakeData["seniorityLevel"][] = ["Mid", "Senior", "Staff / Principal", "Manager"];

export default function IntakeForm({ onSubmit }: IntakeFormProps) {
  const [reviewType, setReviewType] = useState<IntakeData["reviewType"]>("Full Review");
  const [targetMarket, setTargetMarket] = useState<IntakeData["targetMarket"]>("US General");
  const [seniorityLevel, setSeniorityLevel] = useState<IntakeData["seniorityLevel"]>("Senior");
  const [jobDescription, setJobDescription] = useState("");
  const [showJD, setShowJD] = useState(false);

  const handleSubmit = () => {
    onSubmit({ reviewType, targetMarket, seniorityLevel, jobDescription });
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-200">
        <p className="text-sm font-semibold text-gray-900">Set your review context</p>
        <p className="text-xs text-gray-600 mt-0.5">This shapes the analysis and scoring</p>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Review type */}
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wider mb-2">Review type</p>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setReviewType(t)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  reviewType === t
                    ? "bg-white text-black border-white font-medium"
                    : "border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Target market */}
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wider mb-2">Target market</p>
          <div className="flex flex-wrap gap-1.5">
            {TARGET_MARKETS.map((m) => (
              <button
                key={m}
                onClick={() => setTargetMarket(m)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  targetMarket === m
                    ? "bg-white text-black border-white font-medium"
                    : "border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Seniority */}
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wider mb-2">Seniority level</p>
          <div className="flex flex-wrap gap-1.5">
            {SENIORITY_LEVELS.map((s) => (
              <button
                key={s}
                onClick={() => setSeniorityLevel(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  seniorityLevel === s
                    ? "bg-white text-black border-white font-medium"
                    : "border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Job description */}
        <div>
          <button
            onClick={() => setShowJD(!showJD)}
            className="text-xs text-gray-600 hover:text-gray-500 transition-colors flex items-center gap-1"
          >
            <span className="text-gray-800">{showJD ? "▾" : "▸"}</span>
            {showJD ? "Hide job description" : "Paste job description (optional)"}
          </button>
          {showJD && (
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
              rows={4}
              className="mt-2 w-full resize-none text-xs text-gray-700 placeholder-[#444] bg-white border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 transition-colors leading-relaxed"
            />
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={handleSubmit}
          style={{ background: "#000" }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-black active:scale-95 transition-all hover:opacity-90"
        >
          Start review
        </button>
      </div>
    </div>
  );
}
