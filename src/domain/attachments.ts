export type Attachment = {
  title: string;
  url: string;
};

const APPLICATION_ATTACHMENT_KEYWORDS = ['모집공고문', '입주자 모집공고', '입주자모집공고', '공고문'];

export const findPrimaryApplicationAttachment = (attachments: Attachment[]): Attachment | undefined =>
  attachments.find((attachment) =>
    APPLICATION_ATTACHMENT_KEYWORDS.some((keyword) => attachment.title.includes(keyword)),
  );

export const getPrimaryApplicationAttachment = (metadata: Record<string, unknown>): Attachment | null => {
  const attachment = metadata.primaryApplicationAttachment;
  if (
    attachment &&
    typeof attachment === 'object' &&
    !Array.isArray(attachment) &&
    typeof (attachment as Attachment).title === 'string' &&
    typeof (attachment as Attachment).url === 'string'
  ) {
    return attachment as Attachment;
  }

  return null;
};
