
/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

import { Component, ViewChild, ElementRef, OnInit, AfterViewInit, Inject, SimpleChange } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import {Http, Response} from '@angular/http';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/debounceTime';

import { Angular2InjectionTokens } from 'pluginlib/inject-resources';

@Component({
  selector: 'workshopstarter',
  templateUrl: 'workshopstarter-component.html',
  styleUrls: ['workshopstarter-component.css']
})

/**
   A component controls an instance of an App's web content - this Workshop Starter App presents two buttons for which the logic is contained within this component.

   This App is one of a two part tutorial on App building.
   This is the starter App of the tutorial.
   The App's scenario is that it has been opened to submit a task report to a set of users who can handle the task.
   In this case, it is a bug report. We want to find engineers who can fix this bug, but this App does not hold a directory listing for engineers in the company, so we need to communicate with some App which does provide this information.

   In this tutorial, you must build an App which is called by this App in order to list Engineers, is able to be filtered by the office that they work from, and is able to submit a list of engineers which would be able to handle the task.
*/
export class WorkshopStarterComponent implements OnInit, AfterViewInit {
  private showGrid: boolean = false;
  private resultNotReady: boolean = false;
  private columnMetaData: any = null;
  private rows: any = null;
  private query: string;
  private error_msg: any;
  private url: string;
  private openAppAction: ZLUX.Action;
  private filterTableAction: ZLUX.Action;
  private validOwners:TaskOwners;
  private userResults:string = 'N/A. Add users to submit bug report';
  private userBrowserOpened:boolean = false;

  /**
     @param pluginDefinition Plugin Definition can be used by the App framework to perform some action within the context of the Plugin that represents this Appcomponent
     @param log Every App can get a handle on a logger unique to the App. This allows for issuing info, warning, and debug messages which are printed according to the level visibility
   */
  constructor(
              private http: Http,
              private element: ElementRef,
              @Inject(Angular2InjectionTokens.LOGGER) private log: ZLUX.ComponentLogger,    
              @Inject(Angular2InjectionTokens.PLUGIN_DEFINITION) private pluginDefinition: ZLUX.ContainerPluginDefinition
  ) {

    /*
      RocketMVD is a global that exposes some key objects for Apps.
      dispatcher is an object which is used for App to App communication.
      The dispatcher can start new App instances with context provided, or can send a message to a particular instance.
      These dispatcher abilities operate on Actions.
      Actions note the target App, what sort of command to be done for an instance of that App,
      And the format of the context object that will be sent to the App.
     */
    this.openAppAction = RocketMVD.dispatcher.makeAction(
      "org.openmainframe.zowe.workshop-starter.actions.requestusers",      
      "Request users to fulfill task",
      RocketMVD.dispatcher.constants.ActionTargetMode.PluginCreate,
      RocketMVD.dispatcher.constants.ActionType.Launch,
      "org.openmainframe.zowe.workshop-user-browser",
      /*
        This is an argument formatter for providing context for the Action.
        For the simple purpose of this demonstration App, the context object
        Will just be a generic Object with any number of attributes inside, 
        found off of the top-level "data" attribute
        */
      {data: {op:'deref',source:'event',path:['data']}}
    );

    this.filterTableAction = RocketMVD.dispatcher.makeAction(
      "org.openmainframe.zowe.workshop-starter.actions.sortusertable",      
      "Sorts user table in App which has it",
      RocketMVD.dispatcher.constants.ActionTargetMode.PluginFindAnyOrCreate,
      RocketMVD.dispatcher.constants.ActionType.Message,
      "org.openmainframe.zowe.workshop-user-browser",
      {data: {op:'deref',source:'event',path:['data']}}
    );

    /*
      To demonstrate configurability, this App determines which types of employees can handle the task at hand by loading the rules via the Configuration Dataservice - which is a REST API that is used to manage user & administrator preferences and save data.
      */
    this.http.get(RocketMVD.uriBroker.pluginConfigForScopeUri(this.pluginDefinition.getBasePlugin(),'instance','tasks','report-bug.json'))
      .map((res: Response) => res.json()).subscribe(
        data=> {
          this.validOwners = data.contents.taskOwners;
        },
        error=> {
          this.userResults = `Error when requesting resource from server, HTTP error=${error}`;
        }
      );
  }

  ngOnInit(): void {
 
  }

  ngAfterViewInit(): void {

  }

  /**
     This is reached when some App sends a message to an already open instance of this App.
     This app needs to check the eventContext object to determine if the request is in a known format and can be handled at this time. A Promise object is used to alert of success or failure asynchronously.
   */
  zluxOnMessage(eventContext: any): Promise<any> {
    return new Promise((resolve,reject)=> {
      if (!eventContext || !eventContext.data) {
        return reject('Event context missing or malformed');
      }
      switch (eventContext.data.type) {
        /*
          Expecing {data: {type:'loadusers', value:[{user1},{user1}]}} 
         */
      case 'loadusers':
        let users = eventContext.data.value;
        this.log.info(`Acting with users=${JSON.stringify(users)}`);
        let fail = false;
        for (let i =0; i < users.length; i++) {
          let user = users[i];
          if (this.validOwners.department.indexOf(user.department) == -1
              || this.validOwners.location.indexOf(user.location) == -1) {
            this.userResults = `User ${user.firstname} ${user.mi}. ${user.lastname} is not valid for assigning to this task`;
            fail = true;
            break;
          }
        }
        if (!fail) {
          this.userResults = `Bug report created and ${users.length} users have been notified.`;
        }
        resolve();
        break;
      default:
        reject('Event context missing or unknown data.type');
      };
    });    
  }


  /**
     Upon startup of an App instance, it should be able to provide a series of callbacks if it wants to opt-in to certain abilities. In our case, we want this App to listen for a message which we expect to contain the user list for people who can handle our bug report.
   */
  provideZLUXDispatcherCallbacks(): ZLUX.ApplicationCallbacks {
    return {
      onMessage: (eventContext: any): Promise<any> => {
        return this.zluxOnMessage(eventContext);
      }      
    }
  }  

  /**
     When the request App button is pressed on the UI, this function is reached.
     During the constructor of this App, we set up Actions, which are ready to be invoked with some context object.
     We invoke an Action here to request that a user browser (What we make in this tutorial) is opened to find Engineers.
   */
  requestApp():void {
    //We ensure that the user browser app exists before trying to invoke it by doing the following.
    let plugin = RocketMVD.PluginManager.getPlugin("org.openmainframe.zowe.workshop-user-browser");
    if (!plugin) {
      let msg = `Cannot request User Browser App... It was not in the current environment!`
      this.userResults = msg;
      this.log.warn(msg);
      return;
    }
    
    this.userBrowserOpened = true;
    //In case there was a malformed object in the Dataservice Configuration, we can fallback to seeing employees without any department filter, but we expect to filter by a department.
    RocketMVD.dispatcher.invokeAction(this.openAppAction, (!this.validOwners.department) ? null : 
      {'data':{
         'type':'load',
         'filter':{
           'type': 'department',
           'value': this.validOwners.department[0] //Should be 'Engineering', but we loaded this via the Configuration Dataservice at startup so it could be altered.
         }
      }}
    );
  }

  /**
     When the button to filter the user browser's list is pressed, this function is called to send a message to an already opened user browser App instance via an Action of type "PluginFindAnyOrCreate". This should find our one open App and issue the message to it.
   */
  filterByLocation():void {
    let plugin = RocketMVD.PluginManager.getPlugin("org.openmainframe.zowe.workshop-user-browser");
    if (!plugin) {
      let msg = `Cannot request User Browser App... It was not in the current environment!`;
      this.userResults = msg;
      this.log.warn(msg);
      return;
    }

    let fallback = ()=> {
      RocketMVD.dispatcher.invokeAction(this.filterTableAction,
                                        {'data':{
                                          'type':'filter',
                                          'parameters': {
                                            'column': 'location',
                                            'value': 'NY'
                                          }
                                        }}
                                       );  
    };

    let location:string; //where to filter to? We use the browser's Geolocation API, if it is present, for demonstration purposes.
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position)=> {
        let location:string;
        let long = position.coords.longitude;
        if (long !== undefined && long !== null) {
          let distanceToWA = Math.abs(long - (-123));
          let distanceToNY = Math.abs(long - (-74));          
          location = distanceToWA < distanceToNY ? 'WA' : 'NY';
        } else {
          //fallback to NY for demonstration purposes.
          location = 'NY';
        }
        RocketMVD.dispatcher.invokeAction(this.filterTableAction,
                                          {'data':{
                                            'type':'filter',
                                            'parameters': {
                                              'column': 'location',
                                              'value': location
                                            }
                                          }}
                                         );  
      }, (error) => {
        fallback();
      });
    } else {
      //fallback to NY for demonstration purposes.
      fallback();
    }


  }
}

type TaskOwners = {
  department: string[];
  location: string[];
};


/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

