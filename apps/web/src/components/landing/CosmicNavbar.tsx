'use client';

import { useState, useEffect } from 'react';

export default function CosmicNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`nav ${scrolled ? 'scrolled' : ''}`} id="navbar">
      <div className="nav-brand">رؤى</div>
      <div className="nav-links">
        <a href="#models">النماذج</a>
        <a href="#features">الأدوات</a>
        <a href="#how">الطريقة</a>
        <a href="#testimonials">التجارب</a>
      </div>
      <div className="nav-buttons">
        <a href="/login" className="btn btn-outline">تسجيل الدخول</a>
        <a href="/login" className="btn btn-primary">ابدأ الآن</a>
      </div>
    </nav>
  );
}
