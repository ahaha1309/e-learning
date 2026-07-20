(function () {
  const form = document.querySelector('[data-profile-form="true"]');
  const preview = document.querySelector('[data-avatar-preview="true"]');
  const avatarInput = document.getElementById('avatar');
  const submitButton = document.querySelector('[data-profile-submit="true"]');
  const uploadingLabel = document.querySelector('[data-avatar-uploading="true"]');

  if (!form || !preview) {
    return;
  }

  const currentAvatarUrl = preview.getAttribute('data-current-avatar-url') || '';

  function setPreview(url) {
    if (!url) {
      preview.style.backgroundImage = '';
      preview.style.background = 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(148,163,184,0.2))';
      return;
    }
    preview.style.background = '#e2e8f0';
    preview.style.backgroundImage = `url(${url})`;
  }

  // Seed the preview from the existing Cloudinary avatar URL.
  setPreview(currentAvatarUrl);

  // When the user selects a file, read it locally for an instant preview.
  if (avatarInput) {
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) {
        setPreview(currentAvatarUrl);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => setPreview(event.target.result);
      reader.readAsDataURL(file);
    });
  }

  // While the form is submitting (the avatar uploads to Cloudinary),
  // disable the Save button and show an uploading indicator.
  if (form) {
    form.addEventListener('submit', () => {
      if (submitButton) {
        submitButton.disabled = true;
      }
      if (uploadingLabel) {
        uploadingLabel.classList.remove('hidden');
      }
    });
  }
})();
