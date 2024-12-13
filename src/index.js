const express = require('express');
const WebSocket = require('ws');
const { Server } = require('http');
const Y = require('yjs');
const { MongodbPersistence } = require('y-mongodb-provider');
const { setupWSConnection } = require('y-websocket/bin/utils');
const { WebsocketProvider } = require('y-websocket')
const cors = require('cors');
const axios = require('axios');
const e = require('express');

const app = express();
const server = Server(app);
const wss = new WebSocket.Server({ noServer: true });

const mdb = new MongodbPersistence('mongodb://root:dufdurgkrwp1qjqclr@tripeer.co.kr:17017/ydoc', {
  collectionName: 'transactions',
  flushSize: 100,
  multipleCollections: true,
});

// CORS 설정
app.use(cors({
  origin: ['http://localhost:3000','https://tripeer.co.kr','http://localhost:3001', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// JSON 요청 본문 파싱을 위한 미들웨어
app.use(express.json());

// 플랜 생성시 ydoc 탬플릿 생성
app.post('/node/plan', async (req, res) => {
  try {
    const data = req.body;
    const planInfo = data.planInfo;
    const planId = planInfo.planId.toString();;
    const title = planInfo.title;
    const townList = data.townDTOList;
    const startDay = planInfo.startDay;
    const endDay = planInfo.endDay;
    const userInfo = data.userInfo;
    const userId = userInfo.userId;
    userInfo.order = 1;

    // date -> string 형변환
    const startDate = new Date(startDay[0], startDay[1] - 1, startDay[2]);
    const endDate = new Date(endDay[0], endDay[1] - 1, endDay[2]);

    // 날짜 차이 계산 (밀리초 단위)
    const differenceInTime = endDate.getTime() - startDate.getTime();
    // 밀리초를 일로 변환
    const differenceInDays = differenceInTime / (1000 * 3600 * 24);
    const dayCount = differenceInDays + 2;
    console.log(dayCount);

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      "wss://tripeer.co.kr/node", 
      "room-" + planId,
      doc,
      { WebSocketPolyfill: WebSocket }
    );
    console.log(data)
    // WebSocket 연결이 동기화된 후 실행될 코드
    provider.on('synced', () => {
      const YplanId = provider.doc.getText('planId');
      YplanId.insert(0, planId.toString()); 

      const Ytitle = provider.doc.getText('title');
      Ytitle.insert(0, title); 

      const YtownList = provider.doc.getArray('townList');
      YtownList.insert(0, townList); 

      const YstartDay = provider.doc.getText('startDay');
      YstartDay.insert(0, startDay.join('-')); 

      const YendDay = provider.doc.getText('endDay');
      YendDay.insert(0, endDay.join('-')); 

      const YreadMessage = provider.doc.getMap('readMessage');
      YreadMessage.set(userId.toString(), 0); 

      const YuserInfo = provider.doc.getArray('userInfo');
      YuserInfo.insert(0, [userInfo]); 

      const totalYList = provider.doc.getArray("totalYList");
      const timeYList = provider.doc.getArray("timeYList");
      const blockYList = provider.doc.getArray("blockYList");

      for (let i = 0; i < dayCount; i++) {
        const yTime = new Y.Array();
        const yTime2 = new Y.Array();
        yTime.insert(0, []);
        yTime2.insert(0, []);
        totalYList.insert(0, [yTime2]);
        timeYList.insert(0, [yTime]);
        blockYList.insert(0, [false]);
      }
      
      provider.destroy();
    });
    res.status(200).json({ "data" : "ok" });
  } catch (error) {
    console.error('Error parsing JSON!', error);
    res.status(400).json({ error: "Bad request" });
  }
});

// 플랜 초대시 ydoc 탬플릿 생성
app.post('/node/plan/invite', async (req, res) => {
  try {
    const data = req.body;
    const userInfo = data.userInfo
    const planId = data.planId.toString()


    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      "wss://tripeer.co.kr/node", 
      "room-" + planId,
      doc,
      { WebSocketPolyfill: WebSocket }
    );

    provider.on('synced', () => {
      const YchatInfo = provider.doc.getArray('chatInfo');

      const YuserInfo = provider.doc.getArray('userInfo');
      console.log("Initial YuserInfo:", YuserInfo.toArray()); // Log the initial userInfo
      const YreadMessage = provider.doc.getMap('readMessage');
      setTimeout(() => {
        userInfo.order = YuserInfo.length + 1;
        YuserInfo.insert(YuserInfo.length, [userInfo]); 
        YreadMessage.set(userInfo.userId.toString(), YchatInfo.length);
        console.log("Updated YuserInfo after insertion:", YuserInfo.toArray()); // Log after insertion
        console.log("YchatInfo:", YchatInfo.toArray()); // Log the initial chatInfo
        console.log("YreadMessage after set:", Array.from(YreadMessage.entries())); // Log readMessage map
        provider.destroy();
      }, 500);


    });
    console.log(userInfo)
    console.log(planId)
    res.status(200).json({ "data" : "ok" });
  } catch (error) {
    console.error('Error parsing JSON!', error);
    res.status(400).json({ error: "Bad request" });
  }
});

// 플랜 탈퇴시 ydoc에서 유저정보 삭제
app.post('/node/plan/out', async (req, res) => {
  try {
    const data = req.body;
    const userId = data.userId
    const planId = data.planId.toString()

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      "wss://tripeer.co.kr/node", 
      "room-" + planId,
      doc,
      { WebSocketPolyfill: WebSocket }
    );

    provider.on('synced', () => {
      const YuserInfo = provider.doc.getArray('userInfo');
      const YreadMessage = provider.doc.getMap('readMessage');
      setTimeout(() => {
        for (let i = 0 ; i < YuserInfo.length ; i++) {
          if (YuserInfo.get(i).userId == userId) {
            YuserInfo.delete(i, 1)
            YreadMessage.delete(userId.toString())
            break
          }
        }
      }, 500);
    });
    res.status(200).json({ "data" : "ok" });
  } catch (error) {
    console.error('Error parsing JSON!', error);
    res.status(400).json({ error: "Bad request" });
  }
});

// 최단거리 계산 요청 처리
app.post('/node/opt', async (req, res) => {
  try {
    const data = req.body
    const day = parseInt(data.day)
    const option = data.option
    const planId = data.planId
    const doc = new Y.Doc()
    const ws = new WebsocketProvider(
      "wss://tripeer.co.kr/node",
      `room-${planId}`,
      doc,
      {WebSocketPolyfill: WebSocket}
    ); 
    res.status(200).json("ok");
    setTimeout(()=> {
      const totalYList = ws.doc.getArray('totalYList');
      const timeYList = ws.doc.getArray('timeYList');
      const blockYList = ws.doc.getArray('blockYList');
      const arr = totalYList.get(day)
      console.log(req.headers.authorization)
      const request = {
        placeList: arr.toJSON(),
        option : option
      }
      // response.end(JSON.stringify(json));
      axios.post("https://tripeer.co.kr/api/plan/optimizing", request, {
        headers: {authorization: req.headers.authorization,},
      })
      .then(response => {
        console.log(response.data.data)
        arr.delete(0, arr.length);
        arr.insert(0, [...response.data.data.placeList]);
        const time = timeYList.get(parseInt(day))
        // time.delete(0, time.length)
        // time.insert(0, [...response.data.data.spotTime]);
        time.delete(0, time.length)
        time.insert(0, [...response.data.data.optimizing]);

        blockYList.delete(day, 1);
        blockYList.insert(day, [false])
        ws.destroy()
      })
      .catch(err=> {
        console.log(err)
        blockYList.delete(day, 1);
        blockYList.insert(day, [false])
        ws.destroy()
      })

      },200)
    
  } catch (error) {
    console.error('Error parsing JSON!', error);
  }
});

// 히스토리 저장을 위한 api
app.post('/node/plan/save', async (req, res) => {
  try {
    const unsavedPlanIdList = req.body;
    const resArray = await Promise.all(unsavedPlanIdList.map(async id => {
      const Ydoc = await mdb.getYDoc("node/room-" + id);
      const totalYList = Ydoc.getArray('totalYList').toArray();
      for (el in totalYList) {
        console.log(totalYList[el].toJSON())
      }
      const daysIdList = [];
      for (let i = 1; i < totalYList.length; i++) {
        const planday = totalYList[i].toArray();
        const dayIdList = []
        for (let j = 0; j < planday.length; j++) {
          const obj = {
            'day': i,
            'step': j + 1,
            'spotInfoId': planday[j].spotInfoId
          };
          dayIdList.push(obj);
        }
        daysIdList.push(dayIdList)
      }
      return {
        'planId' : id,
        'planDayList' : daysIdList
      };
    }));
    console.log(resArray); // 결과 확인
    res.status(200).json(resArray); // 응답 전송

  } catch (error) {
    console.error('Error processing plans:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 서버 살아있는지 확인하는 코드
app.get('/node/test', async (req, res) => {
  res.json({ res: "테스트" });
});

// planId에 해당하는 ydoc 데이터 확인하는 코드
app.get('/node/get/data', async (req, res) => {
  try {
    const roomId = req.query.roomId;
      
    mdb.getYDoc("node/room-"+roomId).then(Ydoc => {
      const totalYList = Ydoc.getArray('totalYList').toJSON();
      const timeYList = Ydoc.getArray('timeYList').toJSON();
      const planId = roomId
      const json = {
        totalYList : totalYList,
        timeYList : timeYList,
        planId : planId
      }
      res.end(JSON.stringify(json));
    });
  } catch (error) {
    console.error('Error parsing JSON!', error);
    res.status(400).json({ error: "Bad request" });
  }
});


// WebSocket 연결 설정
server.on('upgrade', function(request, socket, head) {
  if (request.url.startsWith('/node')) {
    wss.handleUpgrade(request, socket, head, ws => {
      setupWSConnection(ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', ws => {
  console.log('Connected to /node');
});

// 서버 리스닝 시작
const port = 3001;
server.listen(port, () => {
  console.log(`Listening to http://localhost:${port}`);
});

// Y.js와 MongoDB 퍼시스턴스 설정
require('y-websocket/bin/utils').setPersistence({
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await mdb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    mdb.storeUpdate(docName, newUpdates);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on('update', async (update) => {
      mdb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName, ydoc) => {
  },
});