function isLocalUrl(url) {
  return !url.startsWith('http://') && !url.startsWith('https://');
}

function buildPreviewModel(lecture) {
  const resourceUrl = lecture.resourceUrl || '';
  const resourceType = lecture.resourceType || 'text';

  if (!resourceUrl) {
    return {
      mode: 'empty',
      resourceUrl,
      resourceType,
    };
  }

  if (resourceType === 'video') {
    return {
      mode: 'video',
      resourceUrl,
      resourceType,
    };
  }

  if (resourceType === 'pdf') {
    return {
      mode: 'pdf',
      resourceUrl,
      resourceType,
    };
  }

  if (resourceType === 'ppt' || resourceType === 'document') {
    // Office Online only works with publicly accessible URLs.
    // Local / uploaded files (relative paths) must be downloaded instead.
    if (isLocalUrl(resourceUrl)) {
      return {
        mode: 'download',
        resourceUrl,
        resourceType,
      };
    }
    return {
      mode: 'office',
      resourceUrl,
      resourceType,
      officeUrl: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(resourceUrl)}`,
    };
  }

  if (resourceType === 'link') {
    return {
      mode: 'office',
      resourceUrl,
      resourceType,
      officeUrl: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(resourceUrl)}`,
    };
  }

  return {
    mode: 'text',
    resourceUrl,
    resourceType,
  };
}

module.exports = {
  buildPreviewModel,
};