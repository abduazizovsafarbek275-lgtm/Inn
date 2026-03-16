import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoogleGenAI } from "@google/genai";
import { MatIconModule } from '@angular/material/icon';
import { animate, stagger } from "motion";

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  isCameraActive = signal(false);
  isAnalyzing = signal(false);
  capturedImage = signal<string | null>(null);
  subjectInfo = signal<{ subject: string; topic: string; explanation: string } | null>(null);
  chatMessages = signal<ChatMessage[]>([]);
  userInput = signal('');

  private ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  constructor() {
    // Animation effect for subject info
    effect(() => {
      if (this.subjectInfo()) {
        setTimeout(() => {
          const elements = document.querySelectorAll('.animate-in');
          if (elements.length > 0) {
            animate(
              elements,
              { opacity: [0, 1], y: [20, 0] },
              { delay: stagger(0.1), duration: 0.5 }
            );
          }
        }, 0);
      }
    });
  }

  async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.isCameraActive.set(true);
      
      // Wait for Angular to render the video element due to @if
      setTimeout(() => {
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = stream;
        }
      }, 0);
      
      this.capturedImage.set(null);
      this.subjectInfo.set(null);
    } catch (err) {
      console.error("Kameraga kirishda xatolik:", err);
      alert("Kameraga ruxsat berilmadi yoki kamera topilmadi.");
    }
  }

  stopCamera() {
    const stream = this.videoElement.nativeElement.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    this.isCameraActive.set(false);
  }

  captureImage() {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      this.capturedImage.set(dataUrl);
      this.stopCamera();
      this.analyzeImage(dataUrl);
    }
  }

  async analyzeImage(base64Image: string) {
    this.isAnalyzing.set(true);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Ushbu rasmdagi darslik, daftar yoki doskadagi ma'lumotlarga qarab, hozir qaysi fan o'tilayotganini va mavzu nimaligini aniqlang. 
      Javobni JSON formatida bering: 
      {
        "subject": "Fan nomi (masalan: Matematika, Fizika, Tarix)",
        "topic": "Mavzu nomi",
        "explanation": "Mavzu haqida qisqacha (2-3 gap) tushuntirish"
      }
      Faqat JSON qaytaring. Agar aniqlab bo'lmasa, "Noma'lum" deb yozing.`;

      const imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image.split(',')[1],
        },
      };

      const response = await this.ai.models.generateContent({
        model,
        contents: [{ parts: [imagePart, { text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      this.subjectInfo.set(result);
      
      // Initialize chat with a greeting
      this.chatMessages.set([
        { role: 'model', text: `Salom! Men rasmdan ${result.subject} fani va "${result.topic}" mavzusini aniqladim. Bu mavzu bo'yicha qanday savollaringiz bor?` }
      ]);
    } catch (err) {
      console.error("Tahlil qilishda xatolik:", err);
      this.subjectInfo.set({
        subject: "Xatolik",
        topic: "Aniqlab bo'lmadi",
        explanation: "Rasm sifatini tekshiring va qaytadan urinib ko'ring."
      });
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  async sendMessage() {
    const text = this.userInput().trim();
    if (!text || this.isAnalyzing()) return;

    const currentMessages = this.chatMessages();
    this.chatMessages.set([...currentMessages, { role: 'user', text }]);
    this.userInput.set('');
    this.isAnalyzing.set(true);

    try {
      const chat = this.ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `Siz talabalar uchun aqlli yordamchisiz. Hozirgi fan: ${this.subjectInfo()?.subject}, mavzu: ${this.subjectInfo()?.topic}. Talabaning savollariga sodda va tushunarli tilda javob bering.`
        }
      });

      // Send history + new message
      // Note: sendMessage in @google/genai usually handles history if created from chats.create
      const response = await chat.sendMessage({ message: text });
      
      this.chatMessages.set([...this.chatMessages(), { role: 'model', text: response.text || "Kechirasiz, javob bera olmadim." }]);
    } catch (err) {
      console.error("Xabar yuborishda xatolik:", err);
      this.chatMessages.set([...this.chatMessages(), { role: 'model', text: "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring." }]);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  reset() {
    this.capturedImage.set(null);
    this.subjectInfo.set(null);
    this.chatMessages.set([]);
    this.isCameraActive.set(false);
  }
}
