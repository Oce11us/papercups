import React from 'react';
import {Box, Flex} from 'theme-ui';
import dayjs from 'dayjs';
import {Channel} from 'phoenix';
import * as API from '../api';
import {
  colors,
  Button,
  Content,
  Footer,
  Layout,
  Sider,
  Text,
  TextArea,
  Title,
} from './common';
import {SmileTwoTone} from './icons';
import ChatMessage from './ChatMessage';
import {socket} from '../socket';
import {formatRelativeTime} from '../utils';

// NB: actual message records will look slightly different
type Message = {
  sender: string;
  body: string;
  created_at: string;
  customer_id: string;
  conversation_id: string;
};
// NB: actual conversation records will look different
type Conversation = {
  id: string;
  customer: string;
  date: string;
  preview: string;
  messages?: Array<Message>;
};

type Props = {};
type State = {
  message: string;
  messages: Array<Message>;
  accountId: string;
  userId: string;
  conversations: Array<Conversation>;
  selectedConversationId?: string | null;
  conversationIds: Array<string>;
  conversationsById: {[key: string]: any};
  messagesByConversation: {[key: string]: any};
};

class Dashboard extends React.Component<Props, State> {
  scrollToEl: any = null;

  channel: Channel | null = null;

  state: State = {
    message: '',
    accountId: 'EB504736-0F20-4978-98FF-1A82AE60B266', // TODO: get from auth provider
    userId: '1', // TODO: get from auth provider
    conversations: [],
    messages: [],
    selectedConversationId: null,
    conversationIds: [],
    conversationsById: {},
    messagesByConversation: {},
  };

  componentDidMount() {
    socket.connect();

    API.me().then(console.log).catch(console.log); // TODO: do in AuthProvider

    API.fetchConversations()
      .then((conversations) => {
        if (!conversations || !conversations.length) {
          return; // TODO: handle empty state
        }

        const conversationsById = conversations.reduce(
          (acc: any, conv: any) => {
            return {...acc, [conv.id]: conv};
          },
          {}
        );
        const messagesByConversation = conversations.reduce(
          (acc: any, conv: any) => {
            return {
              ...acc,
              [conv.id]: conv.messages.sort(
                (a: any, b: any) =>
                  +new Date(a.created_at) - +new Date(b.created_at)
              ),
            };
          },
          {}
        );
        const conversationIds = Object.keys(conversationsById).sort(
          (a: string, b: string) => {
            const messagesA = messagesByConversation[a];
            const messagesB = messagesByConversation[b];
            const x = messagesA[messagesA.length - 1];
            const y = messagesB[messagesB.length - 1];

            return +new Date(y?.created_at) - +new Date(x?.created_at);
          }
        );
        const [selectedConversationId] = conversationIds;

        this.setState(
          {
            conversationsById,
            messagesByConversation,
            conversationIds,
            selectedConversationId,
          },
          () => this.scrollToEl.scrollIntoView()
        );

        const {accountId} = this.state;

        this.joinNotificationChannel(
          accountId,
          conversations.map((conv: any) => conv.id)
        );
      })
      .catch((err) => console.log('Error fetching conversations:', err));
  }

  joinNotificationChannel = (
    accountId: string,
    conversationIds: Array<string>
  ) => {
    if (this.channel && this.channel.leave) {
      this.channel.leave(); // TODO: what's the best practice here?
    }

    // TODO: If no conversations exist, join lobby?? (which is just an open chat room???)
    // (this could be a fun little feature... lobby is where you can chat with... us??)
    this.channel = socket.channel(`notification:${accountId}`, {
      ids: conversationIds,
    });

    this.channel.on('shout', (message) => {
      this.handleNewMessage(message);
    });

    this.channel
      .join()
      .receive('ok', (res) => {
        console.log('Joined successfully', res);
      })
      .receive('error', (err) => {
        console.log('Unable to join', err);
      });
  };

  handleSelectConversation = (id: string) => {
    this.setState({selectedConversationId: id}, () =>
      this.scrollToEl.scrollIntoView()
    );
  };

  handleNewMessage = (message: Message) => {
    console.log('New message!', message);

    const {messagesByConversation, conversationIds} = this.state;
    const {conversation_id: conversationId} = message;
    const existing = messagesByConversation[conversationId];
    const update = {
      ...messagesByConversation,
      [conversationId]: [...existing, message],
    };
    const updatedConversationIds = [
      conversationId,
      ...conversationIds.filter((id) => id !== conversationId),
    ];

    this.setState(
      {
        messagesByConversation: update,
        conversationIds: updatedConversationIds,
      },
      () => {
        this.scrollToEl.scrollIntoView();
      }
    );
  };

  handleMessageChange = (e: any) => {
    this.setState({message: e.target.value});
  };

  handleSendMessage = (e?: any) => {
    e && e.preventDefault();

    const {message, accountId, userId, selectedConversationId} = this.state;

    if (!this.channel || !message || message.trim().length === 0) {
      return;
    }

    this.channel.push('shout', {
      body: message,
      sender: 'agent',
      // created_at: new Date(),
      conversation_id: selectedConversationId,
      account_id: accountId,
      user_id: userId,
    });

    this.setState({message: ''});
  };

  formatMessage = (message: any) => {
    return {
      sender: message.customer_id ? 'customer' : 'agent',
      body: message.body,
      created_at: message.created_at,
      customer_id: message.customer_id,
    };
  };

  formatConversation = (conversation: any, messages: Array<any>) => {
    const recent = messages[messages.length - 1];
    const created = dayjs(conversation.created_at);
    const date = formatRelativeTime(created);

    return {
      id: conversation.id,
      timestamp: conversation.created_at,
      customer: 'Anonymous User',
      date: date || '1d', // TODO
      preview: recent && recent.body ? recent.body : '...',
      messages: messages,
    };
  };

  render() {
    const {
      message,
      selectedConversationId,
      conversationIds = [],
      conversationsById = {},
      messagesByConversation = {},
    } = this.state;
    const messages = selectedConversationId
      ? messagesByConversation[selectedConversationId]
      : [];

    return (
      <Layout>
        <Sider
          theme="light"
          width={280}
          style={{
            borderRight: '1px solid #f0f0f0',
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
          }}
        >
          <Box p={3} sx={{borderBottom: '1px solid #f0f0f0'}}>
            <Title level={3} style={{marginBottom: 0, marginTop: 8}}>
              Conversations
            </Title>
          </Box>
          <Box>
            {conversationIds.map((conversationId, idx) => {
              const conversation = conversationsById[conversationId];
              const messages = messagesByConversation[conversationId];
              const formatted = this.formatConversation(conversation, messages);
              const {id, customer, date, preview} = formatted;
              const isHighlighted = id === selectedConversationId;
              const {primary, gold, red, green, gray} = colors;
              const color = [gold, red, green, gray[0]][idx % 4];

              // TODO: move into separate component
              return (
                <Box
                  key={id}
                  p={3}
                  sx={{
                    borderBottom: '1px solid #f0f0f0',
                    borderLeft: isHighlighted
                      ? `2px solid ${colors.primary}`
                      : null,
                    background: isHighlighted ? colors.blue[0] : null,
                    cursor: 'pointer',
                  }}
                  onClick={() => this.handleSelectConversation(id)}
                >
                  <Flex mb={2} sx={{justifyContent: 'space-between'}}>
                    <Flex sx={{alignItems: 'center'}}>
                      <Box mr={2}>
                        <SmileTwoTone
                          style={{fontSize: 16}}
                          twoToneColor={color}
                        />
                      </Box>
                      <Text strong>{customer}</Text>
                    </Flex>
                    <Text type="secondary">{date}</Text>
                  </Flex>
                  <Box
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {preview}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Sider>
        <Layout style={{marginLeft: 280}}>
          <header
            style={{boxShadow: 'rgba(0, 0, 0, 0.1) 0px 0px 2rem', zIndex: 1}}
          >
            <Flex py={3} px={4} backgroundColor={colors.white}>
              <Title level={4} style={{marginBottom: 0, marginTop: 4}}>
                Anonymous User
              </Title>
            </Flex>
          </header>
          <Content style={{overflowY: 'scroll'}}>
            <Box p={4} backgroundColor={colors.white} sx={{minHeight: '100%'}}>
              {messages.map((message: any, key: number) => {
                // Slight hack
                const msg = this.formatMessage(message);
                const next = messages[key + 1];
                const isLastInGroup = next
                  ? msg.customer_id !== next.customer_id
                  : true;

                // TODO: fix `isMe` logic for multiple agents
                return (
                  <ChatMessage
                    key={key}
                    message={msg}
                    isMe={!msg.customer_id}
                    isLastInGroup={isLastInGroup}
                    shouldDisplayTimestamp={isLastInGroup}
                  />
                );
              })}
              <div ref={(el) => (this.scrollToEl = el)} />
            </Box>
          </Content>
          <Footer style={{padding: 0}}>
            <Box px={4} pt={0} pb={4} backgroundColor={colors.white}>
              <Box
                p={2}
                sx={{
                  border: '1px solid #f5f5f5',
                  borderRadius: 4,
                  boxShadow: 'rgba(0, 0, 0, 0.1) 0px 0px 8px',
                }}
              >
                <Box mb={2}>
                  <TextArea
                    className="TextArea--transparent"
                    placeholder="Type your message here!"
                    autoSize={{minRows: 1, maxRows: 4}}
                    value={message}
                    onChange={this.handleMessageChange}
                  />
                </Box>
                <Flex sx={{justifyContent: 'flex-end'}}>
                  <Button type="primary" onClick={this.handleSendMessage}>
                    Send
                  </Button>
                </Flex>
              </Box>
            </Box>
          </Footer>
        </Layout>
      </Layout>
    );
  }
}

export default Dashboard;