import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import MessageInput from './MessageInput';

const socket = io();

const ChatWindow = () => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on('message', (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    return () => {
      socket.off('message');
    };
  }, []);

  return (
    <div>
      <div>
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>
      <MessageInput socket={socket} />
    </div>
  );
};

export default ChatWindow;
