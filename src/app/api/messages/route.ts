import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Fetch messages logic
    res.status(200).json({ messages: [] });
  } else if (req.method === 'POST') {
    // Save message logic
    res.status(201).json({ message: 'Message saved' });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}