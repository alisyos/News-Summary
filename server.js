require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');

const app = express();

// multer 설정 수정
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB 제한
    }
});

// 정적 파일 제공
app.use(express.static('public'));

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// 이미지 업로드 및 요약 API
app.post('/api/summarize', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '파일이 없습니다.' });
        }

        let fileContent;
        const fileType = req.body.fileType;

        if (fileType === 'application/pdf') {
            // PDF 파일 처리
            try {
                const pdfData = await pdf(req.file.buffer);
                fileContent = pdfData.text;
            } catch (error) {
                console.error('PDF 처리 오류:', error);
                return res.status(400).json({ error: 'PDF 파일 처리 중 오류가 발생했습니다.' });
            }
        }

        // 제목과 언론사 요청
        const infoMessage = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: [
                    {
                        type: "text",
                        text: fileType === 'application/pdf' 
                            ? `다음 PDF 텍스트를 분석해주세요:\n\n${fileContent}\n\n다음 형식으로 답변해주세요:\n제목: [정확한 뉴스 제목]\n언론사: [언론사명]`
                            : "이 뉴스 이미지를 분석해주세요..."  // 기존 이미지 프롬프트
                    },
                    ...(fileType.includes('image') ? [{
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: req.file.mimetype,
                            data: req.file.buffer.toString('base64')
                        }
                    }] : [])
                ]
            }]
        });

        // 요약 요청 - 프롬프트 개선
        const summaryMessage = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "이 뉴스 기사를 자세히 읽고 다음 지침에 따라 요약해주세요:\n\n" +
                              "1. 기사의 핵심 내용을 정확하게 파악하세요.\n" +
                              "2. 주거 관련 용어('자취', '외지' 등)를 정확히 사용하세요.\n" +
                              "3. 지원 정책의 세부 내용을 정확히 파악하세요.\n" +
                              "4. 숫자와 날짜는 원문 그대로 정확하게 표기하세요.\n" +
                              "5. 오타나 맥락 오류가 없도록 주의하세요.\n\n" +
                              "2개의 문장으로 자연스럽게 요약해주세요."
                    },
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: req.file.mimetype,
                            data: req.file.buffer.toString('base64')
                        }
                    }
                ]
            }]
        });

        // 응답 파싱 및 검증
        const infoText = infoMessage.content[0].text;
        const headlineMatch = infoText.match(/제목:\s*(.*?)(?=\n|$)/);
        const pressMatch = infoText.match(/언론사:\s*(.*?)(?=\n|$)/);

        const headline = headlineMatch ? headlineMatch[1].trim() : null;
        const press = pressMatch ? pressMatch[1].trim() : null;
        const summary = summaryMessage.content[0].text.trim();

        // 데이터 검증
        if (!headline || headline.length < 5) {
            throw new Error('유효하지 않은 제목입니다.');
        }

        if (!press || press.length < 2) {
            throw new Error('유효하지 않은 언론사명입니다.');
        }

        if (!summary || summary.length < 10) {
            throw new Error('유효하지 않은 요약입니다.');
        }

        // 응답 전송
        res.json({
            headline: headline,
            press: press,
            summary: summary
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: '처리 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 