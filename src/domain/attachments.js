const APPLICATION_ATTACHMENT_KEYWORDS = ['모집공고문', '입주자 모집공고', '입주자모집공고', '공고문'];
export const findPrimaryApplicationAttachment = (attachments) => attachments.find((attachment) => APPLICATION_ATTACHMENT_KEYWORDS.some((keyword) => attachment.title.includes(keyword)));
export const getPrimaryApplicationAttachment = (metadata) => {
    const attachment = metadata.primaryApplicationAttachment;
    if (attachment &&
        typeof attachment === 'object' &&
        !Array.isArray(attachment) &&
        typeof attachment.title === 'string' &&
        typeof attachment.url === 'string') {
        return attachment;
    }
    return null;
};
