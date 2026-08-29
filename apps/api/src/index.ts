import {buildApp} from "./app";
const rawPort=process.env.PORT;
const parsedPort=rawPort?parseInt(rawPort,10):3001;
const port=Number.isInteger(parsedPort)&&parsedPort>0&&parsedPort<=65535?parsedPort:3001;
const server=buildApp();
const start=async()=>{
  try{
    await server.listen({port,host:"0.0.0.0"});
    console.log(`API running on http://localhost:${port}`);
  }catch(err){
    server.log.error(err);
    process.exit(1);
  }
};
start();
