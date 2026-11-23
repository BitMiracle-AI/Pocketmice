/** The sentences about conversations, in English. This file says which sentences there are */
export const en = {
  listLabel: 'Conversations',
  start: 'New conversation',
  /** The two lists the owner of a space switches between */
  mine: 'Yours',
  all: 'All in space',
  allHint: 'As the owner you can read every conversation in this space, also the ones you are not in.',
  noneTitle: 'No conversations yet',
  noneInSpace: 'This space has no conversations yet',
  noneHint: 'A conversation is about one matter. People talk in it, and so do the agents that act for them.',
  showMore: 'Show more',
  /** Said in the list of a conversation nothing was said in yet */
  noMessages: 'No messages yet',
  deletedMessage: 'This message was deleted',
  /** How the latest message of a conversation begins, in the list: who sent it, and what it says */
  preview: (sender: string, text: string) => `${sender}: ${text}`,
  you: 'You',
  unread: (count: number) => (count === 1 ? '1 unread message' : `${count} unread messages`),
  /** Said of a conversation the owner of the space reads without being in it */
  notAMember: 'You are not in this conversation',

  pickTitle: 'Pick a conversation',
  pickHint: 'Or start a new one about something else.',
  goneTitle: 'No such conversation',
  goneDescription: 'It was deleted, or you are no longer in it.',
  toList: 'Go to your conversations',
  backToList: 'Back to conversations',

  startTitle: 'New conversation',
  /** What a conversation is, in one line: under the title of the dialog */
  whatAConversationIs: 'One conversation for one matter. The same people can have as many as they need.',
  titleLabel: 'Title',
  titlePlaceholder: 'Launch plan',
  titleMissing: 'Give the conversation a title.',
  peopleLabel: 'People',
  nobodyElse: 'Nobody else is in this space yet.',
  aloneHint: 'With nobody else in it, it is where you and your own agents talk.',
  peopleHint: 'An agent calling with the API key of anyone in it talks here as well.',
  /** Said to whoever starts a conversation and does not own the space */
  ownerReads: 'The owner of the space can read every conversation in it.',
  startConfirm: 'Start conversation',
  someNotAdded: 'Not everyone could be added. Add them from the members of the conversation.',
  cancel: 'Cancel',

  more: 'More about this conversation',
  rename: 'Rename',
  renameTitle: 'Rename conversation',
  membersTitle: 'Members',
  membersCount: (count: number) => (count === 1 ? '1 member' : `${count} members`),
  membersLabel: 'The members of this conversation',
  membersHint: 'Who talks here. Anyone in it can add someone from the space; only the owner of the space removes.',
  membersHintOwner: 'Who talks here. Anyone in it can add someone from the space; only you can remove someone.',
  nobodyIn: 'Nobody is in this conversation any more.',
  addPeople: 'Add from this space',
  everyoneIsIn: 'Everyone in this space is in it already.',
  add: 'Add',
  addMember: (name: string) => `Add ${name}`,
  removeMember: (name: string) => `Remove ${name} from this conversation`,
  notInSpace: 'They are no longer a member of this space.',
  leave: 'Leave conversation',
  leaveTitle: (title: string) => `Leave “${title}”?`,
  leaveDescription:
    'You will no longer see it, and neither will an agent calling with one of your API keys. Someone in it, or the owner of the space, can add you again.',
  leaveDescriptionOwner:
    'You stop being a member: you can still read it as the owner of the space, and no longer write in it.',
  left: (title: string) => `You left “${title}”`,
  deleteConversation: 'Delete conversation',
  deleteTitle: (title: string) => `Delete “${title}”?`,
  deleteDescription: 'Everything that was said in it is deleted, for everyone. Nothing brings it back.',
  delete: 'Delete',
  deleted: (title: string) => `Deleted “${title}”`,

  messagesLabel: (title: string) => `Messages of “${title}”`,
  noMessagesHint: 'Nothing has been said here yet.',
  showEarlier: 'Show earlier messages',
  newMessages: 'New',
  /** Said of a message an agent sent: whose API key it spoke through, and what the key is called */
  viaKey: (person: string, key: string) => `Sent by an agent, with ${person}'s API key “${key}”.`,
  /** A member a message mentions, as it is written */
  at: (name: string) => `@${name}`,
  /** Who a message mentions when they are no longer in the conversation */
  formerMember: 'someone who left',
  openFile: (name: string) => `Open ${name}`,
  fileGone: 'This file is no longer there',
  deleteMessage: 'Delete message',
  deleteMessageTitle: 'Delete this message?',
  deleteMessageDescription: 'It stays in the conversation as a deleted message, and nobody can read what it said.',
  messageGone: 'That message is no longer there.',

  writeLabel: 'Message',
  writePlaceholder: 'Write a message',
  send: 'Send',
  mention: 'Mention someone',
  mentionHint: 'Who is this for?',
  nameAndYou: (name: string) => `${name} (you)`,
  dropMention: (name: string) => `Do not mention ${name}`,
  pointAtFiles: 'Point at files',
  pointAtFilesHint: 'The message will link to files and folders that are already in this space.',
  pointAtFilesConfirm: 'Done',
  dropFile: (name: string) => `Do not point at ${name}`,
  upOneFolder: 'Up one folder',
  pickFolder: (name: string) => `Point at the folder ${name}`,
  folderEmpty: 'This folder is empty.',
  folderGone: 'This folder is no longer here.',
  picked: (count: number, max: number) => `${count} of at most ${max} picked`,
  mentionOrFileGone:
    'Someone you mentioned has left the conversation, or a file you pointed at is gone. Take it out and send again.',

  /** Said in place of the field to the owner of the space, reading a conversation they are not in */
  readingAsOwner: 'You are reading this as the owner of the space. Join it to say something.',
  join: 'Join conversation'
};
