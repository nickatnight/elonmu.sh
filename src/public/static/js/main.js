if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        target.classList.add('is-in');
        observer.unobserve(target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  for (const target of document.querySelectorAll('[data-reveal]')) {
    target.classList.add('will-reveal');
    observer.observe(target);
  }
}
