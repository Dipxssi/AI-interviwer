import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./pitch.css";

const SLIDE_COUNT = 7;

export function Pitch() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Fraunces:opsz,wght@9..144,560;9..144,640&display=swap";
    document.head.appendChild(link);
    const previousTitle = document.title;
    document.title = "Voice Interviewer — Pitch";
    return () => {
      document.title = previousTitle;
      link.remove();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setIndex((n) => Math.min(n + 1, SLIDE_COUNT - 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setIndex((n) => Math.max(n - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pitch">
      <div className="pitch-stage">
        <header className="pitch-top">
          <div className="pitch-mark">
            <span className="pitch-live" aria-hidden="true" />
            Voice Interviewer
          </div>
          <div>
            {String(index + 1).padStart(2, "0")} / {String(SLIDE_COUNT).padStart(2, "0")}
          </div>
        </header>

        <div className="pitch-frame">
          {index === 0 && <Open />}
          {index === 1 && <Problem />}
          {index === 2 && <Product />}
          {index === 3 && <Controller />}
          {index === 4 && <Voice />}
          {index === 5 && <Review />}
          {index === 6 && <Close />}
        </div>

        <footer className="pitch-bottom">
          <div className="pitch-dots" role="tablist" aria-label="Slides">
            {Array.from({ length: SLIDE_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <div className="pitch-nav">
            <button type="button" onClick={() => setIndex((n) => Math.max(n - 1, 0))} disabled={index === 0}>
              Back
            </button>
            <button
              type="button"
              onClick={() => setIndex((n) => Math.min(n + 1, SLIDE_COUNT - 1))}
              disabled={index === SLIDE_COUNT - 1}
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Open() {
  return (
    <section className="pitch-slide dark" aria-label="Title">
      <div>
        <p className="pitch-kicker">Bolna Symphony Buildathon</p>
        <h1>The first technical screen, spoken.</h1>
        <p className="pitch-lede">
          A candidate talks. The interviewer stays on a rubric. A supervisor gets a score and the quotes behind it.
        </p>
      </div>
      <div className="pitch-footline">
        <span>Voice Interviewer</span>
        <span>Deepgram listens and speaks. Groq decides the next question.</span>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="pitch-slide light" aria-label="Problem">
      <div>
        <p className="pitch-kicker">The hour nobody has</p>
        <h2>The first screen checks one thing.</h2>
        <ul className="pitch-list">
          <li>
            <span>01</span>
            Can this person explain the work on their resume, out loud, without a script.
          </li>
          <li>
            <span>02</span>
            Scheduling that conversation is the bottleneck. A typed form never hears them think.
          </li>
          <li>
            <span>03</span>
            An unconstrained voice model loops, flatters, and invents a history the candidate never lived.
          </li>
        </ul>
      </div>
    </section>
  );
}

function Product() {
  return (
    <section className="pitch-slide light" aria-label="Product">
      <div>
        <p className="pitch-kicker">What happens</p>
        <h2>Four steps. Then a score.</h2>
        <ul className="pitch-list">
          <li>
            <span>01</span>
            The candidate submits LinkedIn, GitHub, and a resume.
          </li>
          <li>
            <span>02</span>
            The interviewer greets them by name and asks about a project they actually shipped.
          </li>
          <li>
            <span>03</span>
            One question at a time. They can interrupt. “I’m done” ends the interview.
          </li>
          <li>
            <span>04</span>
            A score from 0 to 100 is saved. The supervisor opens the transcript.
          </li>
        </ul>
      </div>
    </section>
  );
}

function Controller() {
  return (
    <section className="pitch-slide light" aria-label="How the interviewer is constrained">
      <div>
        <p className="pitch-kicker">Why it is an interview</p>
        <h2>Every turn is a decision, not a chat.</h2>
        <div className="pitch-split">
          <article className="pitch-card">
            <h3>What they hear</h3>
            <p>One or two spoken sentences. No markdown, no praise, no “that’s correct.”</p>
          </article>
          <article className="pitch-card">
            <h3>What stays hidden</h3>
            <p>Follow up, change topic, or end. Plus which competency the answer just evidenced.</p>
          </article>
        </div>
        <ul className="pitch-rules">
          <li>One follow-up per competency, then it must move on.</li>
          <li>It rotates ownership, technical depth, problem solving, and communication.</li>
          <li>It does not invent facts. The profile is only a reason to ask.</li>
        </ul>
      </div>
    </section>
  );
}

function Voice() {
  return (
    <section className="pitch-slide light" aria-label="Voice loop">
      <div>
        <p className="pitch-kicker">The voice loop</p>
        <h2>Hear. Decide. Speak. Yield.</h2>
        <div className="pitch-flow" aria-label="Speech pipeline">
          <span className="pitch-chip">Deepgram hears</span>
          <span className="pitch-arrow">→</span>
          <span className="pitch-chip">Groq decides</span>
          <span className="pitch-arrow">→</span>
          <span className="pitch-chip">Deepgram speaks</span>
        </div>
        <p className="pitch-note">
          If the candidate starts talking, barge-in cuts the interviewer off. The session moves through listening, candidate speaking, processing, and AI speaking — then back to listening until the rubric is covered or the candidate ends it.
        </p>
      </div>
    </section>
  );
}

function Review() {
  return (
    <section className="pitch-slide light" aria-label="Supervisor review">
      <div>
        <p className="pitch-kicker">What a human gets</p>
        <h2>A score you can argue with.</h2>
        <ul className="pitch-list">
          <li>
            <span>01</span>
            0–100, weighted by how much each competency matters. Confidence, not a vibe.
          </li>
          <li>
            <span>02</span>
            The full transcript of what was said.
          </li>
          <li>
            <span>03</span>
            Evidence on each competency: a claim, the candidate’s quote, and a confidence.
          </li>
        </ul>
        <p className="pitch-note">The voice session collects it. The review page is what a hiring manager reads.</p>
      </div>
    </section>
  );
}

function Close() {
  return (
    <section className="pitch-slide dark" aria-label="Close">
      <div>
        <p className="pitch-kicker">Symphony · Abhyas</p>
        <h1>Voice is the interview.</h1>
        <p className="pitch-lede">
          This is a full screen a supervisor can audit: structured questions, a live voice loop, and evidence attached to the score.
        </p>
      </div>
      <div className="pitch-footline">
        <Link className="pitch-try" to="/">
          Start an interview
        </Link>
        <span>Built for the Bolna Symphony Buildathon</span>
      </div>
    </section>
  );
}
