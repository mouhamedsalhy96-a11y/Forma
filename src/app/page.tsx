"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ConfiguredBookingPortal } from "@/components/booking-portal";

type ServiceId = "strength" | "conditioning" | "foundation";
const services = [
  { id: "strength" as const, title: "Strength, with purpose.", category: "PERSONAL TRAINING", duration: "60 min", price: 45, description: "Build confidence under the bar. A focused, one-to-one session shaped around your goals.", detail: "Strength & technique", number: "01" },
  { id: "conditioning" as const, title: "Find your next gear.", category: "CONDITIONING", duration: "45 min", price: 35, description: "Move better, go further. A challenging mix of functional movement and conditioning.", detail: "Functional conditioning", number: "02" },
  { id: "foundation" as const, title: "Start on solid ground.", category: "FIRST SESSION", duration: "30 min", price: 0, description: "Meet your coach, talk through your goals, and find a starting point that feels right.", detail: "Introduction & goal setting", number: "03" },
];
export default function Home() {
  const [view, setView] = useState<"home" | "book" | "sessions">("home");
  const [serviceId, setServiceId] = useState<ServiceId>("strength");
  function openBooking(id: ServiceId = "strength") {
    setServiceId(id);
    setView("book");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <>
      <div className="demo-bar">Portfolio prototype · Fictional coach · Account bookings saved securely</div>
      <header className="header">
        <button className="wordmark" onClick={() => setView("home")} aria-label="Forma home">forma<span>®</span></button>
        <nav aria-label="Main navigation">
          <button className={view === "home" ? "nav-active" : ""} onClick={() => setView("home")}>The studio</button>
          <button className={view === "book" ? "nav-active" : ""} onClick={() => openBooking()}>Sessions</button>
          <button className={view === "sessions" ? "nav-active" : ""} onClick={() => { setView("sessions"); }}>My bookings</button>
          <Link href="/account" className="account-nav">Account</Link>
        </nav>
        <button className="button dark header-cta" onClick={() => openBooking()}>Book a session <span>↗</span></button>
      </header>
      <main id="main">
        {view === "home" && <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><span className="dot" /> INDEPENDENT COACHING. PERSONAL PROGRESS.</div>
              <h1>Show up.<br />Get stronger.<br /><span>Feel like you.</span></h1>
              <p>Personal training that meets you where you are.<br className="desktop-break" /> A clear plan. A coach in your corner. Your next chapter.</p>
              <div className="hero-actions"><button className="button lime" onClick={() => openBooking("foundation")}>Find your starting point <span>↗</span></button><a href="#sessions" className="text-link">Explore sessions <span>↓</span></a></div>
              <div className="coach-line"><div className="coach-monogram">AC</div><div><strong>Alex Carter</strong><span>Your coach. Every session.</span></div><span className="coach-stamp">ONE TO ONE.<br />ALL ABOUT YOU.</span></div>
            </div>
            <div className="hero-image">
              <Image src="/images/studio.jpg" alt="Training studio with strength equipment and free weights" fill priority sizes="(max-width: 800px) 100vw, 50vw" />
              <div className="image-top"><span>THE FORMA STUDIO</span><span>MOVE WITH INTENTION ↗</span></div>
              <div className="image-caption"><span>Less noise.<br />More progress.</span><div className="image-mark">f.</div></div>
            </div>
          </section>
          <div className="principles"><span>BUILT AROUND YOU</span><p>Real coaching <i>✳</i> Sustainable strength <i>✳</i> Progress at your pace</p><span>NO TWO JOURNEYS ALIKE ↗</span></div>
          <section className="services section" id="sessions">
            <div className="section-heading"><div><div className="eyebrow">MAKE TIME FOR YOURSELF</div><h2>A little structure.<br />A lot of possibility.</h2></div><p>Choose your focus. We’ll take it from there.<br />Every session is one-to-one and built around you.</p></div>
            <div className="service-grid">{services.map(item => <article className="service-card" key={item.id}><div className="card-top"><span>{item.category}</span><span className="service-symbol">{item.number === "01" ? "↗" : item.number === "02" ? "✳" : "+"}</span></div><h3>{item.title}</h3><p>{item.description}</p><div className="card-bottom"><span>{item.duration} <span className="separator">/</span> {item.price ? "£" + item.price : "Complimentary"}</span><button aria-label={"Book " + item.detail} onClick={() => openBooking(item.id)}>↗</button></div></article>)}</div>
          </section>
          <section className="closing section"><div><div className="eyebrow">YOUR NEXT CHAPTER STARTS SMALL</div><h2>You bring the effort.<br />I’ll bring the plan.</h2></div><button className="button dark" onClick={() => openBooking("foundation")}>Let’s get started <span>↗</span></button></section>
        </>}
        {view !== "home" && <ConfiguredBookingPortal key={view + serviceId} initialView={view} initialService={serviceId} />}
      </main>
      <footer className="footer"><button className="wordmark" onClick={() => setView("home")}>forma<span>®</span></button><p>Stronger, on your terms.</p><span>Fictional studio · Portfolio prototype</span><Link href="/coach" className="text-link">Trainer workspace ↗</Link><a href="#main">Back to top ↑</a></footer>
    </>
  );
}
