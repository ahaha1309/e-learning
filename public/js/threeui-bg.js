/**
 * ThreeUI-inspired Constellation Field Background
 * Lightweight Canvas 2D implementation of ThreeUI's particle network effect.
 * Creates animated particles with connection lines, mouse interaction,
 * and subtle pulsing glow effects.
 */
(function () {
  'use strict';

  // Respect reduced-motion preference
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function createConstellationField(container, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'constellation-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var particles = [];
    var mouse = { x: -9999, y: -9999 };
    var raf;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Configuration
    var config = {
      particleCount: opts.particleCount || (window.innerWidth < 768 ? 35 : 60),
      connectionDistance: opts.connectionDistance || 140,
      mouseRadius: opts.mouseRadius || 180,
      speed: prefersReducedMotion ? 0 : (opts.speed || 0.3),
      particleSize: opts.particleSize || { min: 1, max: 2.5 },
      colors: opts.colors || {
        particle: 'rgba(16, 185, 129, 0.6)',       // primary emerald
        particleGlow: 'rgba(16, 185, 129, 0.15)',
        connection: 'rgba(16, 185, 129, 0.08)',
        connectionActive: 'rgba(16, 185, 129, 0.25)',
        mouseGlow: 'rgba(16, 185, 129, 0.03)'
      }
    };

    // Check dark mode
    function isDark() {
      return document.documentElement.classList.contains('dark');
    }

    function getColors() {
      if (isDark()) {
        return {
          particle: 'rgba(52, 211, 153, 0.5)',
          particleGlow: 'rgba(52, 211, 153, 0.12)',
          connection: 'rgba(52, 211, 153, 0.06)',
          connectionActive: 'rgba(52, 211, 153, 0.2)',
          mouseGlow: 'rgba(52, 211, 153, 0.04)'
        };
      }
      return config.colors;
    }

    function resize() {
      var rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
    }

    function Particle(w, h) {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.vx = (Math.random() - 0.5) * config.speed;
      this.vy = (Math.random() - 0.5) * config.speed;
      this.size = config.particleSize.min + Math.random() * (config.particleSize.max - config.particleSize.min);
      this.pulse = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.01 + Math.random() * 0.02;
    }

    function initParticles() {
      particles = [];
      var rect = container.getBoundingClientRect();
      for (var i = 0; i < config.particleCount; i++) {
        particles.push(new Particle(rect.width, rect.height));
      }
    }

    function draw() {
      var rect = container.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      ctx.clearRect(0, 0, w, h);

      var colors = getColors();

      // Draw mouse glow
      if (mouse.x > 0 && mouse.y > 0) {
        var gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, config.mouseRadius);
        gradient.addColorStop(0, colors.mouseGlow);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }

      // Update and draw particles
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];

        // Update position
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Mouse interaction - gentle repulsion
        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < config.mouseRadius && dist > 0) {
          var force = (config.mouseRadius - dist) / config.mouseRadius * 0.015;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Damping
        p.vx *= 0.999;
        p.vy *= 0.999;

        // Pulsing size
        var pulseSize = p.size + Math.sin(p.pulse) * 0.5;

        // Draw particle glow
        var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseSize * 4);
        glow.addColorStop(0, colors.particleGlow);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseSize * 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw particle core
        ctx.fillStyle = colors.particle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw connections
        for (var j = i + 1; j < particles.length; j++) {
          var p2 = particles[j];
          var cdx = p.x - p2.x;
          var cdy = p.y - p2.y;
          var cdist = Math.sqrt(cdx * cdx + cdy * cdy);

          if (cdist < config.connectionDistance) {
            var opacity = 1 - (cdist / config.connectionDistance);

            // Check if near mouse for brighter connection
            var midX = (p.x + p2.x) / 2;
            var midY = (p.y + p2.y) / 2;
            var mouseDist = Math.sqrt((midX - mouse.x) * (midX - mouse.x) + (midY - mouse.y) * (midY - mouse.y));
            var nearMouse = mouseDist < config.mouseRadius;

            ctx.strokeStyle = nearMouse ? colors.connectionActive : colors.connection;
            ctx.globalAlpha = opacity * (nearMouse ? 1 : 0.6);
            ctx.lineWidth = nearMouse ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      raf = requestAnimationFrame(draw);
    }

    // Event handlers
    function handleMouseMove(e) {
      var rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function handleMouseLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    // Initialize
    resize();
    initParticles();
    draw();

    window.addEventListener('resize', function () {
      resize();
      initParticles();
    });

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        canvas.remove();
      }
    };
  }

  // Auto-initialize on elements with data-constellation attribute
  function init() {
    var els = document.querySelectorAll('[data-constellation]');
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        // Set relative positioning if not already set
        var pos = window.getComputedStyle(el).position;
        if (pos === 'static') el.style.position = 'relative';
        createConstellationField(el);
      })(els[i]);
    }
  }

  // Also expose globally
  window.ConstellationField = createConstellationField;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
